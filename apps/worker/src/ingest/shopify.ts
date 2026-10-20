import { fetchShopifyProducts, mapShopifyProduct } from "@mall/sources";
import { loadBrands } from "../config.ts";
import { withRun } from "../runs.ts";
import { markUnseenRemoved, upsertListing } from "./upsert.ts";

/** Full catalog pull for every brand whose store exposes /products.json. */
export async function ingestShopify(): Promise<void> {
  const targets = loadBrands().filter((b) => b.feed === "shopify" && b.site);
  for (const b of targets) {
    const startedAt = new Date();
    await withRun("shopify", b.name, async (counts) => {
      const products = await fetchShopifyProducts(b.site!);
      counts.fetched = products.length;
      for (const p of products) {
        const listing = mapShopifyProduct(p, {
          brand: b.name,
          site: b.site!,
          department: b.department,
          menswearOnly: b.menswear_only,
        });
        if (listing) await upsertListing(listing, counts);
      }
      await markUnseenRemoved("shopify", b.name, startedAt);
    });
  }
}
