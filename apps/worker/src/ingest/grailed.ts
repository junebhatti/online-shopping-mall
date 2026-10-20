import { loadBrands, loadQueries, loadRules } from "@mall/config";
import { db, listings, orm } from "@mall/db";
import { getGrailedDetail, mapGrailed, searchGrailed, sleep, toCents } from "@mall/sources";
import { log } from "../log.ts";
import { withRun } from "../runs.ts";
import { gate } from "../taste/gate.ts";
import { refreshKnownPrice, upsertListing } from "./upsert.ts";

const MAX_DETAIL_CALLS_PER_CYCLE = 200;

/** Newest US menswear on Grailed for each clothing and shoe query. */
export async function ingestGrailed(): Promise<void> {
  const q = loadQueries();
  const rules = loadRules();
  const brands = new Map(loadBrands().map((b) => [b.name.toLowerCase(), b]));
  const maxPrice = Math.max(...Object.values(rules.price_ceilings_usd));
  let detailBudget = MAX_DETAIL_CALLS_PER_CYCLE;

  for (const query of [...q.clothing, ...q.shoes]) {
    await withRun("grailed", query, async (counts) => {
      const hits = await searchGrailed(query, maxPrice);
      counts.fetched = hits.length;
      const known = await knownIds(hits.map((h) => String(h.id)));
      for (const hit of hits) {
        if (known.has(String(hit.id))) {
          await refreshKnownPrice("grailed", String(hit.id), toCents(hit.price), counts);
          continue;
        }
        const quick = mapGrailed(hit);
        // Detail calls only for pieces whose size label already fits; the rest are stored so they aren't re-checked.
        const fits = gate(quick, rules, brands.get(quick.brand.toLowerCase())).passed;
        if (!fits || detailBudget <= 0) {
          await upsertListing(quick, counts);
          continue;
        }
        detailBudget--;
        await upsertListing(mapGrailed(hit, await getGrailedDetail(hit.id)), counts);
        await sleep(200);
      }
    });
  }
  if (detailBudget <= 0) log.warn("Grailed detail budget used up this cycle; remaining fits get details next cycle");
}

async function knownIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db()
    .select({ id: listings.externalId })
    .from(listings)
    .where(orm.and(orm.eq(listings.source, "grailed"), orm.inArray(listings.externalId, ids)));
  return new Set(rows.map((r) => r.id));
}
