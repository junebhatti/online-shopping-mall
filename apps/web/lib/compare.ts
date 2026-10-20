import { db, listings, orm } from "@mall/db";
import { displayName } from "./format.ts";

type Listing = typeof listings.$inferSelect;

export type RetailGap = { medianNewCents: number; samples: number; pctUnder: number };

/**
 * Resale vs retail: compare a used listing with what the same brand and category
 * sells for new (original price where known). Needs at least 3 new listings to say anything.
 */
export async function retailGap(l: Listing): Promise<RetailGap | null> {
  if (!l.isUsed) return null;
  const rows = await db()
    .select({ price: orm.sql<number>`coalesce(${listings.retailCents}, ${listings.priceCents})` })
    .from(listings)
    .where(
      orm.and(
        orm.eq(listings.isUsed, false),
        orm.eq(listings.category, l.category),
        orm.sql`lower(${listings.brand}) = lower(${l.brand})`,
      ),
    )
    .limit(500);
  if (rows.length < 3) return null;
  const sorted = rows.map((r) => Number(r.price)).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const pctUnder = Math.round((1 - l.priceCents / median) * 100);
  return pctUnder > 0 ? { medianNewCents: median, samples: rows.length, pctUnder } : null;
}

export type AlsoAt = { id: number; store: string; priceCents: number; url: string };

const tokens = (title: string) =>
  new Set(
    displayName(title)
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );

/** The same product at other stores: same brand, mostly the same title words. Cheapest first. */
export async function alsoAt(l: Listing): Promise<AlsoAt[]> {
  const rows = await db()
    .select({ id: listings.id, store: listings.store, title: listings.title, priceCents: listings.priceCents, url: listings.url })
    .from(listings)
    .where(
      orm.and(
        orm.eq(listings.status, "active"),
        orm.ne(listings.store, l.store),
        orm.eq(listings.category, l.category),
        orm.sql`lower(${listings.brand}) = lower(${l.brand})`,
      ),
    )
    .limit(300);
  const mine = tokens(l.title);
  if (mine.size === 0) return [];
  return rows
    .filter((r) => {
      const theirs = tokens(r.title);
      const shared = [...mine].filter((w) => theirs.has(w)).length;
      return shared / new Set([...mine, ...theirs]).size >= 0.5;
    })
    .sort((a, b) => a.priceCents - b.priceCents)
    .slice(0, 5)
    .map(({ id, store, priceCents, url }) => ({ id, store, priceCents, url }));
}
