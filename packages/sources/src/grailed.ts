import { z } from "zod";
import type { Condition } from "@mall/db";
import { categorize } from "./categorize.ts";
import { HttpError, fetchJson, BROWSER_UA, toCents } from "./http.ts";
import type { NormalizedListing } from "./types.ts";

// Grailed search runs on Algolia with a public search-only key embedded in grailed.com/shop.
// Newest-first index suits a 2-hourly ingest. Detail (measurements, all photos) is a public JSON endpoint.
const INDEX = "Listing_by_date_added_production";

const hitSchema = z.object({
  id: z.number(),
  title: z.string(),
  designer_names: z.string().nullable().optional(),
  price: z.number(),
  price_drops: z.array(z.number()).optional(),
  size: z.string().nullable().optional(),
  condition: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  category_path: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  sold: z.boolean().optional(),
  cover_photo: z.object({ url: z.string() }).nullable().optional(),
  shipping: z.record(z.string(), z.object({ amount: z.number(), enabled: z.boolean() })).optional(),
});

export type GrailedHit = z.infer<typeof hitSchema>;

const searchSchema = z.object({ hits: z.array(hitSchema), nbHits: z.number() });

const detailSchema = z.object({
  data: z.object({
    description: z.string().nullable().optional(),
    measurements: z.array(z.object({ inches: z.number(), measurement_type_id: z.number() })).optional(),
    photos: z.array(z.object({ url: z.string() })).optional(),
    pretty_size: z.string().nullable().optional(),
    sold: z.boolean().optional(),
    deleted: z.boolean().optional(),
  }),
});

export type GrailedDetail = z.infer<typeof detailSchema>["data"];

type Keys = { appId: string; searchKey: string };
let keys: Keys | undefined;

/** Read the public Algolia app id and search key from grailed.com/shop. Called again if a key is rejected. */
async function loadKeys(): Promise<Keys> {
  const res = await fetch("https://www.grailed.com/shop", {
    headers: { "user-agent": BROWSER_UA, accept: "text/html" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new HttpError("https://www.grailed.com/shop", res.status, "");
  const html = await res.text();
  const appId = html.match(/"appId":"([A-Z0-9]+)"/)?.[1];
  const searchKey = html.match(/"publicSearchKey":"([a-f0-9]+)"/)?.[1];
  if (!appId || !searchKey) throw new Error("Grailed Algolia keys not found in grailed.com/shop; the page layout changed");
  keys = { appId, searchKey };
  return keys;
}

export async function searchGrailed(query: string, maxPriceUsd: number): Promise<GrailedHit[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const k = keys ?? (await loadKeys());
    try {
      const res = await fetchJson(`https://${k.appId.toLowerCase()}-dsn.algolia.net/1/indexes/${INDEX}/query`, searchSchema, {
        method: "POST",
        headers: { "x-algolia-application-id": k.appId, "x-algolia-api-key": k.searchKey, "content-type": "application/json" },
        body: JSON.stringify({
          query,
          hitsPerPage: 50,
          page: 0,
          filters: 'department:menswear AND location:"United States"',
          numericFilters: [`price_i<=${maxPriceUsd}`],
          attributesToHighlight: [],
        }),
      });
      return res.hits.filter((h) => !h.sold);
    } catch (err) {
      if (attempt === 0 && err instanceof HttpError && (err.status === 403 || err.status === 401)) {
        keys = undefined; // key rotated
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}

export async function getGrailedDetail(id: number): Promise<GrailedDetail> {
  const res = await fetchJson(`https://www.grailed.com/api/listings/${id}`, detailSchema);
  return res.data;
}

const CONDITION: Record<string, Condition> = {
  is_new: "new",
  is_gently_used: "excellent",
  is_used: "good",
  is_worn: "fair",
};

// Grailed measurement type ids (from grailed.com/shop "measurement_types"). Chest is pit to pit.
const MEASURE: Record<number, "chestIn" | "lengthIn" | "waistIn" | "inseamIn"> = {
  1: "chestIn",
  2: "lengthIn",
  12: "chestIn",
  13: "lengthIn",
  6: "waistIn",
  7: "inseamIn",
};

export function mapGrailed(hit: GrailedHit, detail?: GrailedDetail): NormalizedListing {
  const drops = hit.price_drops ?? [];
  const original = drops.length > 1 ? Math.max(...drops) : 0;
  const condition = (hit.condition && CONDITION[hit.condition]) || null;
  const usShipping = hit.shipping?.us;
  const measurements: NonNullable<NormalizedListing["attributes"]["measurements"]> = {};
  for (const m of detail?.measurements ?? []) {
    const key = MEASURE[m.measurement_type_id];
    if (!key || m.inches <= 0) continue;
    // Grailed sellers measure waist laid flat; a 16" flat waist is a 32" waist.
    measurements[key] = key === "waistIn" && m.inches < 24 ? m.inches * 2 : m.inches;
  }
  const photos = detail?.photos?.map((p) => p.url) ?? (hit.cover_photo ? [hit.cover_photo.url] : []);
  return {
    source: "grailed",
    store: "Grailed",
    externalId: String(hit.id),
    url: `https://www.grailed.com/listings/${hit.id}`,
    title: hit.title,
    brand: hit.designer_names?.split(" × ")[0]?.trim() || "Unbranded",
    department: "clothing",
    category: categorize(`${hit.title} ${(hit.category_path ?? "").replace(/[._]/g, " ")}`, "clothing"),
    priceCents: toCents(hit.price),
    retailCents: original > hit.price ? toCents(original) : null,
    currency: "USD",
    isUsed: condition !== "new",
    condition,
    images: photos.slice(0, 6),
    attributes: {
      sizes: hit.size ? [{ label: hit.size, available: true }] : [],
      measurements,
      shippingCents: usShipping?.enabled ? toCents(usShipping.amount) : undefined,
      sellerLocation: hit.location === "United States" ? "US" : (hit.location ?? undefined),
      gender: hit.department === "menswear" ? "men" : undefined,
      description: (detail?.description ?? "").slice(0, 600),
    },
  };
}
