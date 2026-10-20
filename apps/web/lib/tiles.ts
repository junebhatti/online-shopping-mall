import { cutouts, db, listings, orm, ratings, saves, type Category, type Verdict } from "@mall/db";
import { displayName, pctOff } from "./format.ts";

export type Tile = {
  id: number;
  brand: string;
  name: string;
  store: string;
  url: string;
  priceCents: number;
  retailCents: number | null;
  pct: number | null;
  category: Category;
  isUsed: boolean;
  /** Right-hand caption meta: colour for new, "size · condition" for used, volume for fragrance. */
  meta: string | null;
  image: string;
  hasCutout: boolean;
  isNew: boolean;
  saved: boolean;
  verdict: Verdict | null;
  status: "active" | "sold" | "removed";
  firstSeenAt: Date;
  admittedAt: Date | null;
};

const CONDITION_LABEL: Record<string, string> = {
  new: "new",
  like_new: "like new",
  excellent: "excellent",
  good: "good",
};

/** Base select for anything rendered as a tile: listing plus saved / rated / cutout flags. */
export function tileQuery() {
  return db()
    .select({
      l: listings,
      saved: orm.sql<boolean>`${saves.id} is not null`,
      verdict: ratings.verdict,
      hasCutout: orm.sql<boolean>`${cutouts.listingId} is not null`,
    })
    .from(listings)
    .leftJoin(saves, orm.eq(saves.listingId, listings.id))
    .leftJoin(ratings, orm.eq(ratings.listingId, listings.id))
    .leftJoin(cutouts, orm.eq(cutouts.listingId, listings.id));
}

type Row = Awaited<ReturnType<typeof tileQuery>>[number];

export function toTile({ l, saved, verdict, hasCutout }: Row): Tile {
  const a = l.attributes;
  const color = a.colors?.[0];
  const meta = l.isUsed
    ? [a.matchedSize, l.condition ? CONDITION_LABEL[l.condition] : null].filter(Boolean).join(" · ") || null
    : l.department === "fragrance"
      ? a.volumeMl
        ? `${a.volumeMl} ml`
        : null
      : (color ?? null);
  return {
    id: l.id,
    brand: l.isUsed && l.source !== "shopify" ? `Vintage ${l.brand}` : l.brand,
    name: displayName(l.title),
    store: l.store,
    url: l.url,
    priceCents: l.priceCents,
    retailCents: l.retailCents,
    pct: pctOff(l.priceCents, l.retailCents),
    category: l.category,
    isUsed: l.isUsed,
    meta,
    image: `/img/${l.id}`,
    hasCutout,
    isNew: Date.now() - l.firstSeenAt.getTime() < 24 * 3_600_000,
    saved,
    verdict: verdict ?? null,
    status: l.status,
    firstSeenAt: l.firstSeenAt,
    admittedAt: l.admittedAt,
  };
}
