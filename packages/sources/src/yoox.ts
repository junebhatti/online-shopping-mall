import { z } from "zod";
import { categorize } from "./categorize.ts";
import { fetchJson, toCents } from "./http.ts";
import type { NormalizedListing } from "./types.ts";

export type YooxConfig = { app_id: string; search_key: string; index: string; department: string };

const hitSchema = z.object({
  objectID: z.string(),
  model: z.object({
    id: z.string(),
    brand: z.array(z.string()),
    gender: z.string().nullable().optional(),
    mainMaterial: z.string().nullable().optional(),
    categories: z.object({ macro: z.string().nullable().optional(), micro: z.string().nullable().optional() }),
  }),
  modelBestOfferByPrice: z.object({ currentPrice: z.number(), fullPrice: z.number().nullable().optional(), currency: z.string() }),
  availableSizes: z.array(z.string()).optional(),
  images: z.object({ url: z.string(), shotTypes: z.array(z.string()).optional() }).optional(),
});

export type YooxHit = z.infer<typeof hitSchema>;

const headers = (c: YooxConfig) => ({
  "x-algolia-application-id": c.app_id,
  "x-algolia-api-key": c.search_key,
  "content-type": "application/json",
});

const base = (c: YooxConfig) => `https://${c.app_id.toLowerCase()}-dsn.algolia.net/1/indexes`;

/** Yoox brand facet value for a brand name, e.g. "MAISON MARGIELA-50 > MAISON MARGIELA-50". */
export async function resolveYooxBrand(c: YooxConfig, name: string): Promise<string | null> {
  const res = await fetchJson(
    `${base(c)}/${c.index}/facets/model.brand/query`,
    z.object({ facetHits: z.array(z.object({ value: z.string() })) }),
    { method: "POST", headers: headers(c), body: JSON.stringify({ facetQuery: name, maxFacetHits: 20 }) },
  );
  const want = name.toUpperCase().replace(/[’']/g, "'");
  return (
    res.facetHits
      .map((h) => h.value)
      .find((v) => {
        const [top, sub] = v.split(" > ");
        return top === sub && top?.replace(/-\d+$/, "") === want;
      }) ?? null
  );
}

/** Every men's sale product for one brand facet. */
export async function fetchYooxBrand(c: YooxConfig, brandFacet: string): Promise<YooxHit[]> {
  const res = await fetchJson(
    `${base(c)}/${c.index}/query`,
    z.object({ hits: z.array(hitSchema), nbHits: z.number() }),
    {
      method: "POST",
      headers: headers(c),
      body: JSON.stringify({
        facetFilters: [[`departments:${c.department}`], [`model.brand:${brandFacet}`]],
        filters: "visible:true AND purchasable:true",
        hitsPerPage: 1000,
        page: 0,
        attributesToRetrieve: ["objectID", "model", "modelBestOfferByPrice", "availableSizes", "images"],
      }),
    },
  );
  if (res.nbHits > res.hits.length) {
    throw new Error(`Yoox ${brandFacet}: ${res.nbHits} hits but only ${res.hits.length} returned; add paging before trusting removals`);
  }
  return res.hits;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

export function mapYoox(h: YooxHit, brandName: string): NormalizedListing | null {
  const offer = h.modelBestOfferByPrice;
  if (offer.currency !== "USD") return null;
  const micro = h.model.categories.micro ?? "";
  const material = h.model.mainMaterial ?? "";
  const img = h.images?.url ? `https://www.yoox.com/images/items/${h.images.url.replace(/^\/~\//, "")}` : null;
  const shots = img
    ? [img, ...(h.images?.shotTypes ?? []).filter((t) => t !== "F").map((t) => img.replace(/_f\.jpg$/, `_${t.toLowerCase()}.jpg`))]
    : [];
  const priceCents = toCents(offer.currentPrice);
  const full = offer.fullPrice ? toCents(offer.fullPrice) : 0;
  return {
    source: "yoox",
    store: "Yoox",
    externalId: h.objectID,
    url: `https://www.yoox.com/us/${h.objectID}/item`,
    title: [material && cap(material), micro && micro.toLowerCase()].filter(Boolean).join(" ") || cap(micro || "piece"),
    brand: brandName,
    department: "clothing",
    category: categorize(`${micro} ${h.model.categories.macro ?? ""}`, "clothing"),
    priceCents,
    retailCents: full > priceCents ? full : null,
    currency: "USD",
    isUsed: false,
    condition: "new",
    images: shots.slice(0, 5),
    attributes: {
      sizes: (h.availableSizes ?? []).map((label) => ({ label, available: true })),
      gender: h.model.gender === "Man" ? "men" : h.model.gender === "Woman" ? "women" : undefined,
      productType: micro,
      sellerLocation: "US",
    },
  };
}
