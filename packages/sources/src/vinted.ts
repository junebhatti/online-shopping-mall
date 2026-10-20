import { z } from "zod";
import type { Condition } from "@mall/db";
import { categorize } from "./categorize.ts";
import { BROWSER_UA, HttpError, fetchJson, toCents } from "./http.ts";
import type { NormalizedListing } from "./types.ts";

// Vinted US search. The homepage hands every visitor an anonymous, public-scope access token
// (cookie access_token_web, valid 24h); the catalogue API accepts it. Search only: detail pages are HTML.
const MEN_CATALOG = 5;

const itemSchema = z.object({
  id: z.number(),
  title: z.string(),
  url: z.string(),
  price: z.object({ amount: z.string(), currency_code: z.string() }),
  item_box: z.object({ first_line: z.string().nullable().optional(), second_line: z.string().nullable().optional() }),
  photo: z.object({ url: z.string().optional(), full_size_url: z.string().optional() }).nullable().optional(),
  photos: z.array(z.object({ url: z.string().optional(), full_size_url: z.string().optional() })).optional(),
});

export type VintedItem = z.infer<typeof itemSchema>;

let token: { value: string; expiresAt: number } | undefined;

async function anonToken(): Promise<string> {
  if (token && token.expiresAt > Date.now()) return token.value;
  const res = await fetch("https://www.vinted.com/", {
    headers: { "user-agent": BROWSER_UA, accept: "text/html" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new HttpError("https://www.vinted.com/", res.status, "");
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith("access_token_web="));
  const value = cookie?.split(";")[0]?.slice("access_token_web=".length);
  if (!value) throw new Error("Vinted homepage set no access_token_web cookie; the anonymous session flow changed");
  token = { value, expiresAt: Date.now() + 20 * 3_600_000 };
  return value;
}

export async function searchVinted(query: string, maxPriceUsd: number): Promise<VintedItem[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const params = new URLSearchParams({
      search_text: query,
      page: "1",
      per_page: "96",
      order: "newest_first",
      price_to: String(maxPriceUsd),
      currency: "USD",
      "attribute_ids[catalog]": String(MEN_CATALOG),
    });
    try {
      const res = await fetchJson(`https://api.www.vinted.com/svc-catalogue/items?${params}`, z.object({ items: z.array(itemSchema) }), {
        // Without Locale the results come back French-localised and nearly empty.
        headers: { cookie: `access_token_web=${await anonToken()}`, locale: "en-US" },
      });
      return res.items;
    } catch (err) {
      if (attempt === 0 && err instanceof HttpError && (err.status === 401 || err.status === 403)) {
        token = undefined; // expired session, fetch a fresh one
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}

const CONDITION: Record<string, Condition> = {
  "new with tags": "new",
  "new without tags": "like_new",
  "very good": "excellent",
  good: "good",
  satisfactory: "fair",
};

export function mapVinted(i: VintedItem): NormalizedListing | null {
  if (i.price.currency_code !== "USD") return null;
  // second_line is "W32 · Very good" (size · condition); search has no structured fields for either.
  const parts = (i.item_box.second_line ?? "").split(" · ").map((x) => x.trim());
  const condition = parts.map((x) => CONDITION[x.toLowerCase()]).find(Boolean) ?? null;
  const size = parts.find((x) => !CONDITION[x.toLowerCase()]) ?? null;
  const photos = [i.photo, ...(i.photos ?? [])]
    .map((p) => p?.full_size_url ?? p?.url)
    .filter((u): u is string => !!u);
  return {
    source: "vinted",
    store: "Vinted",
    externalId: String(i.id),
    url: `https://www.vinted.com${i.url}`,
    title: i.title,
    brand: i.item_box.first_line?.trim() || "Unbranded",
    department: "clothing",
    category: categorize(i.title, "clothing"),
    priceCents: toCents(i.price.amount),
    retailCents: null,
    currency: "USD",
    isUsed: condition !== "new",
    condition,
    images: [...new Set(photos)].slice(0, 6),
    attributes: {
      sizes: size ? [{ label: size, available: true }] : [],
      sellerLocation: "US",
      gender: "men",
    },
  };
}
