import { z } from "zod";
import type { Condition } from "@mall/db";
import { categorize } from "./categorize.ts";
import { parseMeasurements } from "./ebay.ts";
import { fetchJson, toCents } from "./http.ts";
import type { NormalizedListing } from "./types.ts";

// Poshmark's web app reads search results from a public JSON endpoint; descriptions come back in search.
const money = z.object({ val: z.string(), currency_code: z.string() });
const CDN = "https://di2ponv0v5otw.cloudfront.net/";

const postSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  price_amount: money,
  first_user_price_amount: money.nullable().optional(),
  size: z.string().nullable().optional(),
  condition: z.string().nullable().optional(),
  department: z.object({ display: z.string() }).nullable().optional(),
  category_v2: z.object({ display: z.string() }).nullable().optional(),
  picture_url: z.string().nullable().optional(),
  pictures: z.array(z.object({ url_large: z.string().optional(), path: z.string().optional() })).optional(),
  inventory: z.object({ status: z.string() }).optional(),
  colors: z.array(z.object({ name: z.string() })).optional(),
});

export type PoshmarkPost = z.infer<typeof postSchema>;

const searchSchema = z.object({ data: z.array(postSchema) });

export async function searchPoshmark(query: string): Promise<PoshmarkPost[]> {
  const request = {
    filters: { department: "Men", inventory_status: ["available"] },
    query,
    experience: "all", // the endpoint returns 500 without it
    sort_by: "added_desc",
    count: 48,
  };
  const url = `https://poshmark.com/vm-rest/posts?request=${encodeURIComponent(JSON.stringify(request))}&summarize=true`;
  const res = await fetchJson(url, searchSchema);
  return res.data.filter((p) => (p.inventory?.status ?? "available") === "available");
}

/**
 * Is one listing still for sale? Only the status is validated; detail differs from search in other
 * fields. A taken-down post comes back as HTTP 200 wrapping {error: {errorType: "PostRemovedError"}}.
 */
export async function poshmarkListingStatus(id: string): Promise<"active" | "sold" | "removed"> {
  const res = await fetchJson(
    `https://poshmark.com/vm-rest/posts/${encodeURIComponent(id)}`,
    z.union([
      z.object({ inventory: z.object({ status: z.string() }) }),
      z.object({ error: z.object({ errorType: z.string(), statusCode: z.number().optional() }) }),
    ]),
  );
  if ("error" in res) {
    if (res.error.errorType === "PostRemovedError" || res.error.statusCode === 404) return "removed";
    throw new Error(`Poshmark post ${id}: ${res.error.errorType}`);
  }
  return res.inventory.status === "available" ? "active" : "sold";
}

const CONDITION: Record<string, Condition> = { nwt: "new", ret: "new", uln: "like_new", ug: "good", uf: "fair" };

export function mapPoshmark(p: PoshmarkPost): NormalizedListing | null {
  if (p.price_amount.currency_code !== "USD") return null;
  const priceCents = toCents(p.price_amount.val);
  // Poshmark's "original price" is the seller's claimed retail, so only a real price drop counts as a markdown.
  const firstCents = p.first_user_price_amount ? toCents(p.first_user_price_amount.val) : 0;
  const condition = (p.condition && CONDITION[p.condition]) || null;
  const pictures = (p.pictures ?? [])
    .map((x) => x.url_large ?? (x.path ? `${CDN}${x.path}` : null))
    .filter((u): u is string => !!u);
  const images = pictures.length ? pictures : p.picture_url ? [p.picture_url] : [];
  const description = (p.description ?? "").slice(0, 1200);
  return {
    source: "poshmark",
    store: "Poshmark",
    externalId: p.id,
    url: `https://poshmark.com/listing/${p.id}`,
    title: p.title,
    brand: p.brand?.trim() || "Unbranded",
    department: "clothing",
    category: categorize(`${p.title} ${p.category_v2?.display ?? ""}`, "clothing"),
    priceCents,
    retailCents: firstCents > priceCents ? firstCents : null,
    currency: "USD",
    isUsed: condition !== "new",
    condition,
    images: images.slice(0, 6),
    attributes: {
      sizes: p.size ? [{ label: p.size, available: true }] : [],
      measurements: parseMeasurements(description),
      colors: p.colors?.map((c) => c.name),
      sellerLocation: "US",
      gender: p.department?.display === "Men" ? "men" : undefined,
      description: description.slice(0, 600),
    },
  };
}
