import { loadBrands, loadQueries, loadRules, loadSources } from "@mall/config";
import { db, listings, orm } from "@mall/db";
import { HttpError, getGrailedDetail, mapGrailed, searchGrailed, sleep, toCents } from "@mall/sources";
import { log } from "../log.ts";
import { clearIfFailing, withRun } from "../runs.ts";
import { gate } from "../taste/gate.ts";
import { refreshKnownPrice, upsertListing } from "./upsert.ts";

const MAX_DETAIL_CALLS_PER_CYCLE = 200;

/** Newest US menswear on Grailed for each clothing and shoe query. */
export async function ingestGrailed(): Promise<void> {
  const q = loadQueries();
  const rules = loadRules();
  const brands = new Map(loadBrands().map((b) => [b.name.toLowerCase(), b]));
  const cfg = loadSources().grailed;
  const maxPrice = Math.max(...Object.values(rules.price_ceilings_usd));
  // Grailed's own API can block by IP; after the first 403 this cycle, store pieces without measurements.
  let detailBlocked = false;
  let withoutDetail = 0;
  let detailBudget = MAX_DETAIL_CALLS_PER_CYCLE;
  let hitsTotal = 0;
  let deferred = 0;

  for (const query of [...q.clothing, ...q.shoes]) {
    await withRun("grailed", query, async (counts) => {
      const hits = await searchGrailed(cfg, query, maxPrice);
      counts.fetched = hits.length;
      hitsTotal += hits.length;
      const known = await knownIds(hits.map((h) => String(h.id)));
      for (const hit of hits) {
        if (known.has(String(hit.id))) {
          await refreshKnownPrice("grailed", String(hit.id), toCents(hit.price), counts);
          continue;
        }
        const quick = mapGrailed(hit);
        // Detail calls only for pieces whose size label already fits; the rest are stored so they aren't re-checked.
        const fits = gate(quick, rules, brands.get(quick.brand.toLowerCase())).passed;
        if (!fits) {
          await upsertListing(quick, counts);
          continue;
        }
        // Out of detail calls: leave it unstored so next cycle sees it as new and fetches measurements.
        if (detailBudget <= 0) {
          deferred++;
          continue;
        }
        if (detailBlocked) {
          withoutDetail++;
          await upsertListing(quick, counts);
          continue;
        }
        detailBudget--;
        try {
          await upsertListing(mapGrailed(hit, await getGrailedDetail(hit.id)), counts);
        } catch (err) {
          if (!(err instanceof HttpError && err.status === 403)) throw err;
          detailBlocked = true;
          withoutDetail++;
          await upsertListing(quick, counts);
        }
        await sleep(200);
      }
    });
  }
  if (deferred) log.warn(`Grailed detail budget used up; ${deferred} fitting listings deferred to the next cycle`);
  if (hitsTotal === 0) throw new Error("every Grailed search returned nothing this cycle; the source is likely broken");
  if (detailBlocked) {
    // Recorded as a failure so Settings shows it; the listings themselves were still stored.
    await withRun("grailed", "detail (measurements)", async () => {
      throw new Error(`Grailed's listing API returned 403; ${withoutDetail} pieces stored without measurements`);
    });
  } else {
    await clearIfFailing("grailed", "detail (measurements)");
  }
}

async function knownIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db()
    .select({ id: listings.externalId })
    .from(listings)
    .where(orm.and(orm.eq(listings.source, "grailed"), orm.inArray(listings.externalId, ids)));
  return new Set(rows.map((r) => r.id));
}
