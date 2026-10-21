import { z } from "zod";
import type { Condition } from "@mall/db";
import { categorize } from "./categorize.ts";
import { HttpError, fetchJson, toCents } from "./http.ts";
import type { NormalizedListing } from "./types.ts";

// Grailed search runs on Algolia with a public, search-only key (config/sources.yaml). Detail
// (measurements, all photos) is Grailed's own JSON endpoint, which can block by IP.
export type GrailedConfig = { app_id: string; search_key: string; index: string; live_index: string };

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

const algolia = (c: GrailedConfig) => ({
  base: `https://${c.app_id.toLowerCase()}-dsn.algolia.net/1/indexes`,
  headers: { "x-algolia-application-id": c.app_id, "x-algolia-api-key": c.search_key, "content-type": "application/json" },
});

export async function searchGrailed(c: GrailedConfig, query: string, maxPriceUsd: number): Promise<GrailedHit[]> {
  const a = algolia(c);
  const res = await fetchJson(`${a.base}/${c.index}/query`, searchSchema, {
    method: "POST",
    headers: a.headers,
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
}

/** Still for sale? Looks the listing up in the live index; not found there means sold or taken down. */
export async function grailedListingStatus(c: GrailedConfig, id: string): Promise<"active" | "sold" | "removed"> {
  const a = algolia(c);
  try {
    const res = await fetchJson(
      `${a.base}/${c.live_index}/${encodeURIComponent(id)}?attributesToRetrieve=sold`,
      z.object({ sold: z.boolean().optional() }),
      { headers: a.headers },
    );
    return res.sold ? "sold" : "active";
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return "removed";
    throw err;
  }
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
