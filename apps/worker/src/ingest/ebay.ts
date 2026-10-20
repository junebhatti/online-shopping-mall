import { db, listings, orm, type Department } from "@mall/db";
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
import { loadQueries, loadRules } from "../config.ts";
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

  let detailBudget = MAX_DETAIL_CALLS_PER_CYCLE;
  for (const s of searches) {
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
      log.warn("eBay detail budget used up for this cycle; remaining searches wait for the next one");
      break;
    }
  }
}

async function knownIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db()
    .select({ id: listings.externalId })
    .from(listings)
    .where(orm.and(orm.eq(listings.source, "ebay"), orm.inArray(listings.externalId, ids)));
  return new Set(rows.map((r) => r.id));
}
