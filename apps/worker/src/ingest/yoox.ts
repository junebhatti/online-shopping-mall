import { loadBrands, loadSources } from "@mall/config";
import { db, listings, orm } from "@mall/db";
import { fetchYooxBrand, mapYoox, resolveYooxBrand } from "@mall/sources";
import { log } from "../log.ts";
import { withRun } from "../runs.ts";
import { markUnseenRemoved, upsertListing } from "./upsert.ts";

/** Men's sale on Yoox for every clothing brand in config/brands.yaml that Yoox carries. */
export async function ingestYoox(): Promise<void> {
  const cfg = loadSources().yoox;
  const startedAt = new Date();
  let allOk = true;
  let fetchedTotal = 0;
  for (const b of loadBrands().filter((x) => x.department === "clothing")) {
    const status = await withRun("yoox", b.name, async (counts) => {
      let resolved = 0;
      for (const name of [b.name, ...(b.aliases ?? [])]) {
        const facet = await resolveYooxBrand(cfg, name);
        if (!facet) continue; // Yoox doesn't carry this name
        resolved++;
        const hits = await fetchYooxBrand(cfg, facet);
        counts.fetched += hits.length;
        for (const h of hits) {
          const l = mapYoox(h, b.name);
          if (l) await upsertListing(l, counts);
        }
      }
      fetchedTotal += counts.fetched;
      // A brand we have live Yoox listings for that no longer resolves means Yoox's facet format changed.
      if (resolved === 0 && (await activeYoox(b.name)) > 0) {
        throw new Error(`Yoox no longer resolves "${b.name}" but it has active listings; nothing was marked removed`);
      }
    });
    if (status === "error") allOk = false;
  }
  if (fetchedTotal === 0 && (await activeYoox()) > 0) {
    throw new Error("Yoox returned nothing for every brand; not marking the catalog removed");
  }
  // Only a complete pull can say what's no longer on sale.
  if (allOk) await markUnseenRemoved("yoox", "Yoox", startedAt);
  else log.warn("yoox: some brands failed, so nothing was marked removed this run");
}

async function activeYoox(brand?: string): Promise<number> {
  const [row] = await db()
    .select({ n: orm.count() })
    .from(listings)
    .where(
      orm.and(
        orm.eq(listings.source, "yoox"),
        orm.eq(listings.status, "active"),
        brand ? orm.eq(listings.brand, brand) : undefined,
      ),
    );
  return row?.n ?? 0;
}
