import { z } from "zod";
import type { Department } from "@mall/db";
import { categorize, detectGender } from "./categorize.ts";
import { fetchJson, sleep, toCents } from "./http.ts";
import type { NormalizedListing } from "./types.ts";

const variantSchema = z.object({
  id: z.number(),
  title: z.string(),
  option1: z.string().nullable(),
  option2: z.string().nullable(),
  option3: z.string().nullable(),
  price: z.string(),
  compare_at_price: z.string().nullable(),
  available: z.boolean(),
});

const productSchema = z.object({
  id: z.number(),
  title: z.string(),
  handle: z.string(),
  vendor: z.string(),
  product_type: z.string(),
  tags: z.union([z.array(z.string()), z.string()]),
  body_html: z.string().nullable().optional(),
  options: z.array(z.object({ name: z.string(), position: z.number(), values: z.array(z.string()) })),
  variants: z.array(variantSchema),
  images: z.array(z.object({ src: z.string() })),
});

export type ShopifyProduct = z.infer<typeof productSchema>;

const pageSchema = z.object({ products: z.array(productSchema) });

export type ShopifyTarget = {
  /** Brand display name, e.g. "Pool House New York". */
  brand: string;
  site: string;
  department: Department;
  /** When the whole store is menswear, unlabeled products count as men's. */
  menswearOnly?: boolean;
};

const SIZE_OPTION = /size|waist|length|inseam|fit/i;
const COLOR_OPTION = /colou?r/i;
const MAX_PAGES = 40;

export async function fetchShopifyProducts(site: string): Promise<ShopifyProduct[]> {
  const all: ShopifyProduct[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${site.replace(/\/$/, "")}/products.json?limit=250&page=${page}`;
    const { products } = await fetchJson(url, pageSchema);
    if (products.length === 0) return all;
    all.push(...products);
    await sleep(800);
  }
  // A truncated catalog would mark the rest as removed, so refuse instead.
  throw new Error(`${site} has more than ${MAX_PAGES * 250} products; raise MAX_PAGES`);
}

export function mapShopifyProduct(p: ShopifyProduct, target: ShopifyTarget): NormalizedListing | null {
  const tags = Array.isArray(p.tags) ? p.tags : p.tags.split(",").map((t) => t.trim());
  const sizeIdx = p.options.filter((o) => SIZE_OPTION.test(o.name)).map((o) => o.position);
  const colorIdx = p.options.find((o) => COLOR_OPTION.test(o.name))?.position;
  const optionAt = (v: z.infer<typeof variantSchema>, pos: number) =>
    pos === 1 ? v.option1 : pos === 2 ? v.option2 : v.option3;

  const available = p.variants.filter((v) => v.available);
  if (available.length === 0) return null;

  const sizes = p.variants.map((v) => ({
    label: sizeIdx.length ? sizeIdx.map((i) => optionAt(v, i) ?? "").join(" / ") : "One Size",
    available: v.available,
  }));

  // Cheapest available variant sets the price; markdown comes from its compare_at.
  const cheapest = available.reduce((a, b) => (Number(b.price) < Number(a.price) ? b : a));
  const priceCents = toCents(cheapest.price);
  const compare = cheapest.compare_at_price ? toCents(cheapest.compare_at_price) : 0;

  const text = [p.title, p.product_type, tags.join(" ")].join(" ");
  const gender = detectGender(text) ?? (target.menswearOnly ? "men" : undefined);

  return {
    source: "shopify",
    store: target.brand,
    externalId: `${new URL(target.site).hostname}:${p.id}`,
    url: `${target.site.replace(/\/$/, "")}/products/${p.handle}`,
    title: p.title,
    brand: target.brand,
    department: target.department,
    category: categorize(`${p.title} ${p.product_type}`, target.department),
    priceCents,
    retailCents: compare > priceCents ? compare : null,
    currency: "USD",
    isUsed: false,
    condition: "new",
    images: p.images.slice(0, 6).map((i) => i.src),
    attributes: {
      sizes,
      colors: colorIdx
        ? [...new Set(p.variants.map((v) => optionAt(v, colorIdx)).filter((c): c is string => !!c))]
        : undefined,
      tags,
      productType: p.product_type,
      gender,
      description: stripHtml(p.body_html ?? "").slice(0, 600),
    },
  };
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
