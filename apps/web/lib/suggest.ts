import { loadBrands } from "@mall/config";
import { db, listings, orm, ratings, saves } from "@mall/db";

export type BrandSuggestion = { brand: string; wear: number; saved: number; strongFits: number; score: number };

const NOISE = new Set(["unbranded", "other", "vintage", "unknown", "handmade", "custom", "no brand", "none"]);

/** Lowercase, drop "vintage"/"polo by" style prefixes and punctuation so "Polo by Ralph Lauren" = "ralph lauren". */
export const normalizeBrand = (b: string) =>
  b
    .toLowerCase()
    .replace(/\b(vintage|polo by|polo|by)\b/g, " ")
    .replace(/[^a-z0-9&]+/g, " ")
    .trim();

/**
 * Brands not in config/brands.yaml that keep earning signals: "wear" ratings (3 points),
 * saves (2) and judge fits of 8+ (1). Two points or more makes a suggestion.
 */
export async function brandSuggestions(limit = 8): Promise<BrandSuggestion[]> {
  const known = new Set(loadBrands().flatMap((b) => [b.name, ...(b.aliases ?? [])]).map(normalizeBrand));
  const rows = await db()
    .select({
      brand: listings.brand,
      wear: orm.sql<number>`count(*) filter (where ${ratings.verdict} = 'wear')`.mapWith(Number),
      saved: orm.sql<number>`count(${saves.id})`.mapWith(Number),
      strongFits: orm.sql<number>`count(*) filter (where ${listings.judgeFit} >= 8)`.mapWith(Number),
    })
    .from(listings)
    .leftJoin(ratings, orm.eq(ratings.listingId, listings.id))
    .leftJoin(saves, orm.eq(saves.listingId, listings.id))
    .where(orm.eq(listings.gate, "passed"))
    .groupBy(listings.brand);

  const merged = new Map<string, BrandSuggestion>();
  for (const r of rows) {
    const key = normalizeBrand(r.brand);
    // Sub-labels count as the brand you already follow ("Woolrich Woolen Mills", "Carhartt WIP").
    if (!key || NOISE.has(key) || isKnown(key, known)) continue;
    const m = merged.get(key) ?? { brand: r.brand, wear: 0, saved: 0, strongFits: 0, score: 0 };
    m.wear += r.wear;
    m.saved += r.saved;
    m.strongFits += r.strongFits;
    m.score = m.wear * 3 + m.saved * 2 + m.strongFits;
    merged.set(key, m);
  }
  return [...merged.values()]
    .filter((s) => s.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export const isKnown = (key: string, known: Set<string>) => known.has(key) || [...known].some((k) => key.startsWith(`${k} `));
