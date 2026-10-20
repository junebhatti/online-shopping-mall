import { loadBrands, loadSources } from "@mall/config";
import { fetchYooxBrand, mapYoox, resolveYooxBrand } from "@mall/sources";
import { log } from "../log.ts";
import { withRun } from "../runs.ts";
import { markUnseenRemoved, upsertListing } from "./upsert.ts";

/** Men's sale on Yoox for every clothing brand in config/brands.yaml that Yoox carries. */
export async function ingestYoox(): Promise<void> {
  const cfg = loadSources().yoox;
  const startedAt = new Date();
  let allOk = true;
  for (const b of loadBrands().filter((x) => x.department === "clothing")) {
    const status = await withRun("yoox", b.name, async (counts) => {
      for (const name of [b.name, ...(b.aliases ?? [])]) {
        const facet = await resolveYooxBrand(cfg, name);
        if (!facet) continue; // Yoox doesn't carry this name
        const hits = await fetchYooxBrand(cfg, facet);
        counts.fetched += hits.length;
        for (const h of hits) {
          const l = mapYoox(h, b.name);
          if (l) await upsertListing(l, counts);
        }
      }
    });
    if (status === "error") allOk = false;
  }
  // Only a complete pull can say what's no longer on sale.
  if (allOk) await markUnseenRemoved("yoox", "Yoox", startedAt);
  else log.warn("yoox: some brands failed, so nothing was marked removed this run");
}
