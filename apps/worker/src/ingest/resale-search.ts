import { loadQueries, loadRules } from "@mall/config";
import { db, listings, orm } from "@mall/db";
import { sleep, type NormalizedListing } from "@mall/sources";
import { withRun } from "../runs.ts";
import { refreshKnownPrice, upsertListing } from "./upsert.ts";

/**
 * Run every clothing and shoe query against a search-only marketplace (results already carry
 * size and condition). Known listings get a cheap price refresh; new ones are inserted.
 */
export async function ingestResaleSearch<T>(
  source: string,
  search: (query: string, maxPriceUsd: number) => Promise<T[]>,
  map: (item: T) => NormalizedListing | null,
): Promise<void> {
  const q = loadQueries();
  const maxPrice = Math.max(...Object.values(loadRules().price_ceilings_usd));
  for (const query of [...q.clothing, ...q.shoes]) {
    await withRun(source, query, async (counts) => {
      const mapped = (await search(query, maxPrice)).map(map).filter((l): l is NormalizedListing => l !== null);
      counts.fetched = mapped.length;
      const ids = mapped.map((l) => l.externalId);
      const known = new Set(
        ids.length
          ? (
              await db()
                .select({ id: listings.externalId })
                .from(listings)
                .where(orm.and(orm.eq(listings.source, source), orm.inArray(listings.externalId, ids)))
            ).map((r) => r.id)
          : [],
      );
      for (const l of mapped) {
        if (known.has(l.externalId)) await refreshKnownPrice(source, l.externalId, l.priceCents, counts);
        else await upsertListing(l, counts);
      }
    });
    await sleep(1000);
  }
}
