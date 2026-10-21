import { db, listings, orm, saves, watches, type Department } from "@mall/db";
import { HttpError } from "@mall/sources";
import {
  EBAY_CATEGORY,
  ebayCredentialsFromEnv,
  getEbayItem,
  mapEbayItem,
  searchEbay,
  sleep,
  toCents,
  type EbayCredentials,
} from "@mall/sources";
import { loadQueries, loadRules } from "@mall/config";
import { log } from "../log.ts";
import { withRun } from "../runs.ts";
import { refreshKnownPrice, upsertListing } from "./upsert.ts";

// Browse API allows 5,000 calls/day. Each cycle: ~36 searches + detail calls for new items only.
const MAX_DETAIL_CALLS_PER_CYCLE = 150;

export async function ingestEbay(): Promise<void> {
  let creds: EbayCredentials;
  try {
    creds = ebayCredentialsFromEnv();
  } catch (err) {
    // Record the missing keys as a failed run so Settings shows why eBay is empty.
    await withRun("ebay", null, async () => {
      throw err;
    });
    return;
  }

  const q = loadQueries();
  const maxPrice = Math.max(...Object.values(loadRules().price_ceilings_usd));
  const searches: { query: string; department: Department; categoryId?: string }[] = [
    ...q.clothing.map((query) => ({ query, department: "clothing" as const, categoryId: EBAY_CATEGORY.clothing })),
    ...q.shoes.map((query) => ({ query, department: "clothing" as const, categoryId: EBAY_CATEGORY.shoes })),
    ...q.fragrance.map((query) => ({ query, department: "fragrance" as const })),
  ];
  // Watches are searched too, so a watched cologne turns up even if it isn't in queries.yaml.
  for (const w of await db().select().from(watches).where(orm.eq(watches.active, true))) {
    if (!searches.some((s) => s.query === w.query)) searches.push({ query: w.query, department: w.department });
  }

  let detailBudget = MAX_DETAIL_CALLS_PER_CYCLE;
  // Start somewhere different each 2-hour cycle so a used-up budget doesn't always skip the same tail.
  const offset = Math.floor(Date.now() / 7_200_000) % searches.length;
  const ordered = [...searches.slice(offset), ...searches.slice(0, offset)];
  for (const [i, s] of ordered.entries()) {
    await withRun("ebay", s.query, async (counts) => {
      const results = await searchEbay(creds, { query: s.query, categoryId: s.categoryId, maxPriceUsd: maxPrice });
      counts.fetched = results.length;
      const known = await knownIds(results.map((r) => r.itemId));
      for (const summary of results) {
        if (known.has(summary.itemId)) {
          if (summary.price) await refreshKnownPrice("ebay", summary.itemId, toCents(summary.price.value), counts);
          continue;
        }
        if (detailBudget-- <= 0) break;
        const item = await getEbayItem(creds, summary.itemId);
        const mapped = mapEbayItem(item, s.department);
        if (mapped) await upsertListing(mapped, counts);
        await sleep(150);
      }
    });
    if (detailBudget <= 0) {
      log.warn(`eBay detail budget used up; ${ordered.length - i - 1} searches wait for the next cycle (order rotates)`);
      break;
    }
  }
  await refreshSavedEbay(creds);
}

async function knownIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db()
    .select({ id: listings.externalId })
    .from(listings)
    .where(orm.and(orm.eq(listings.source, "ebay"), orm.inArray(listings.externalId, ids)));
  return new Set(rows.map((r) => r.id));
}

/** Saved eBay items are re-checked every cycle so drops and sell-outs reach the digest. */
export async function refreshSavedEbay(creds: EbayCredentials): Promise<void> {
  const saved = await db()
    .select({ id: listings.id, externalId: listings.externalId, department: listings.department })
    .from(saves)
    .innerJoin(listings, orm.eq(saves.listingId, listings.id))
    .where(orm.and(orm.eq(listings.source, "ebay"), orm.eq(listings.status, "active")));
  if (saved.length === 0) return;
  await withRun("ebay", "saved items", async (counts) => {
    counts.fetched = saved.length;
    for (const s of saved) {
      try {
        const mapped = mapEbayItem(await getEbayItem(creds, s.externalId), s.department);
        if (mapped) await upsertListing(mapped, counts);
      } catch (err) {
        // 404 means the listing ended; anything else is a real failure for this run.
        if (err instanceof HttpError && err.status === 404) {
          await db().update(listings).set({ status: "sold", updatedAt: new Date() }).where(orm.eq(listings.id, s.id));
          counts.updated++;
        } else throw err;
      }
      await sleep(150);
    }
  });
}
