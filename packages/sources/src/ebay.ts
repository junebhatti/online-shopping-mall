import { z } from "zod";
import type { Condition, Department } from "@mall/db";
import { categorize, detectGender } from "./categorize.ts";
import { fetchJson, toCents } from "./http.ts";
import { stripHtml } from "./shopify.ts";
import type { NormalizedListing } from "./types.ts";

// eBay Browse API, production. Docs: developer.ebay.com/api-docs/buy/browse
const API = "https://api.ebay.com";
const MARKETPLACE = "EBAY_US";

/** eBay category ids. 1059 = Men's Clothing, 93427 = Men's Shoes. */
export const EBAY_CATEGORY: Partial<Record<Department | "shoes", string>> = {
  clothing: "1059",
  shoes: "93427",
};

const money = z.object({ value: z.string(), currency: z.string() });

const summarySchema = z.object({
  itemId: z.string(),
  title: z.string(),
  itemWebUrl: z.string(),
  price: money.optional(),
  marketingPrice: z.object({ originalPrice: money.optional() }).optional(),
  condition: z.string().optional(),
  conditionId: z.string().optional(),
  image: z.object({ imageUrl: z.string() }).optional(),
  additionalImages: z.array(z.object({ imageUrl: z.string() })).optional(),
  shippingOptions: z
    .array(z.object({ shippingCostType: z.string().optional(), shippingCost: money.optional() }))
    .optional(),
  itemLocation: z.object({ country: z.string().optional(), postalCode: z.string().optional() }).optional(),
  buyingOptions: z.array(z.string()).optional(),
});

export type EbaySummary = z.infer<typeof summarySchema>;

const searchSchema = z.object({
  total: z.number().optional(),
  itemSummaries: z.array(summarySchema).optional(),
});

const itemSchema = summarySchema.extend({
  brand: z.string().optional(),
  description: z.string().optional(),
  shortDescription: z.string().optional(),
  localizedAspects: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
});

export type EbayItem = z.infer<typeof itemSchema>;

const tokenSchema = z.object({ access_token: z.string(), expires_in: z.number() });

export type EbayCredentials = { clientId: string; clientSecret: string };

export function ebayCredentialsFromEnv(env = process.env): EbayCredentials {
  const clientId = env.EBAY_CLIENT_ID?.trim();
  const clientSecret = env.EBAY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("EBAY_CLIENT_ID / EBAY_CLIENT_SECRET are not set in .env.local (eBay keys pending setup)");
  }
  return { clientId, clientSecret };
}

let cachedToken: { token: string; expiresAt: number } | undefined;

async function appToken(creds: EbayCredentials): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const res = await fetchJson(`${API}/identity/v1/oauth2/token`, tokenSchema, {
    method: "POST",
    headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }).toString(),
  });
  cachedToken = { token: res.access_token, expiresAt: Date.now() + res.expires_in * 1000 };
  return res.access_token;
}

async function authed(creds: EbayCredentials) {
  return {
    authorization: `Bearer ${await appToken(creds)}`,
    "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE,
    "X-EBAY-C-ENDUSERCTX": "contextualLocation=country=US",
  };
}

export type EbaySearch = {
  query: string;
  categoryId?: string;
  maxPriceUsd?: number;
  limit?: number;
};

/** One search call. US sellers, fixed price or best offer, newest listings first. */
export async function searchEbay(creds: EbayCredentials, s: EbaySearch): Promise<EbaySummary[]> {
  const filter = [
    "itemLocationCountry:US",
    "deliveryCountry:US",
    "buyingOptions:{FIXED_PRICE|BEST_OFFER}",
    "priceCurrency:USD",
    s.maxPriceUsd ? `price:[..${s.maxPriceUsd}]` : undefined,
  ]
    .filter(Boolean)
    .join(",");
  const params = new URLSearchParams({
    q: s.query,
    filter,
    sort: "newlyListed",
    limit: String(s.limit ?? 50),
  });
  if (s.categoryId) params.set("category_ids", s.categoryId);
  const res = await fetchJson(`${API}/buy/browse/v1/item_summary/search?${params}`, searchSchema, {
    headers: await authed(creds),
  });
  return res.itemSummaries ?? [];
}

/** Full item: aspects (size, brand, measurements) and description. One call per item. */
export async function getEbayItem(creds: EbayCredentials, itemId: string): Promise<EbayItem> {
  return fetchJson(`${API}/buy/browse/v1/item/${encodeURIComponent(itemId)}`, itemSchema, {
    headers: await authed(creds),
  });
}

const CONDITION_BY_ID: Record<string, Condition> = {
  "1000": "new", // New with tags
  "1500": "like_new", // New without tags
  "1750": "like_new", // New with defects -> gate checks defects text
  "2750": "like_new", // Like new
  "3000": "good", // Pre-owned (sellers use this for everything from excellent to rough)
  "4000": "excellent", // Very good
  "5000": "good",
  "6000": "fair", // Acceptable
  "7000": "poor", // For parts
};

export function mapEbayItem(item: EbayItem, department: Department): NormalizedListing | null {
  if (!item.price || item.price.currency !== "USD") return null;
  const aspects = Object.fromEntries((item.localizedAspects ?? []).map((a) => [a.name.toLowerCase(), a.value]));
  const description = stripHtml(item.description ?? item.shortDescription ?? "");
  const condition = (item.conditionId && CONDITION_BY_ID[item.conditionId]) || null;
  const shipping = item.shippingOptions?.[0]?.shippingCost;
  const original = item.marketingPrice?.originalPrice;
  const priceCents = toCents(item.price.value);
  const retail = original ? toCents(original.value) : 0;
  const brand = item.brand ?? aspects.brand ?? "Unbranded";
  const sizeLabel = aspects.size ?? aspects["size (men's)"] ?? aspects["us shoe size"] ?? aspects["waist size"];
  const text = `${item.title} ${aspects.department ?? ""} ${aspects["size type"] ?? ""}`;

  return {
    source: "ebay",
    store: "eBay",
    externalId: item.itemId,
    url: item.itemWebUrl,
    title: item.title,
    brand,
    department,
    category: categorize(`${item.title} ${aspects.type ?? ""} ${aspects.style ?? ""}`, department),
    priceCents,
    retailCents: retail > priceCents ? retail : null,
    currency: "USD",
    isUsed: condition !== "new",
    condition,
    images: [item.image?.imageUrl, ...(item.additionalImages ?? []).map((i) => i.imageUrl)]
      .filter((u): u is string => !!u)
      .slice(0, 6),
    attributes: {
      sizes: sizeLabel ? [{ label: sizeLabel, available: true }] : [],
      measurements: parseMeasurements(`${description} ${Object.entries(aspects).map(([k, v]) => `${k} ${v}`).join(" ")}`),
      colors: aspects.color ? [aspects.color] : undefined,
      decade: aspects.decade,
      shippingCents: shipping ? toCents(shipping.value) : undefined,
      sellerLocation: item.itemLocation?.country,
      gender: detectGender(text),
      description: description.slice(0, 600),
    },
  };
}

/**
 * Pull garment measurements out of free text, e.g. "Pit to pit 22 in, Length 27".
 * Values are inches; numbers outside sane garment ranges are ignored.
 */
export function parseMeasurements(text: string): NonNullable<NormalizedListing["attributes"]["measurements"]> {
  const t = text.toLowerCase().replace(/["”″]/g, " in ");
  const grab = (re: RegExp, min: number, max: number) => {
    const m = t.match(re);
    const n = m?.[1] ? Number(m[1]) : NaN;
    return n >= min && n <= max ? n : undefined;
  };
  const chest = grab(/(?:pit[\s-]*to[\s-]*pit|p2p|chest|armpit to armpit)[^0-9]{0,12}(\d{2}(?:\.\d+)?)/, 15, 35);
  const length = grab(/(?:length|top to bottom|collar to hem|shoulder to hem|back length)[^0-9]{0,12}(\d{2}(?:\.\d+)?)/, 18, 50);
  const waist = grab(/waist[^0-9]{0,12}(\d{2}(?:\.\d+)?)/, 24, 46);
  const inseam = grab(/inseam[^0-9]{0,12}(\d{2}(?:\.\d+)?)/, 24, 38);
  return Object.fromEntries(
    Object.entries({ chestIn: chest, lengthIn: length, waistIn: waist, inseamIn: inseam }).filter(([, v]) => v !== undefined),
  );
}
