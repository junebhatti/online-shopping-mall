import { db, listings, orm, pins, pricePoints, ratings, saves, sourceRuns } from "@mall/db";
import { loadPinterest } from "@mall/config";
import { alsoAt, retailGap } from "./compare.ts";
import { brandMix } from "./mix.ts";
import { tileQuery, toTile, type Tile } from "./tiles.ts";

const notRejectedByOwner = orm.or(orm.isNull(ratings.verdict), orm.ne(ratings.verdict, "not"));

/** Feed = admitted, still for sale, and not marked "would not wear". */
export async function feed(): Promise<{ sale: Tile[]; justListed: Tile[] }> {
  const rows = await tileQuery()
    .where(orm.and(orm.isNotNull(listings.admittedAt), orm.eq(listings.status, "active"), notRejectedByOwner))
    .orderBy(orm.desc(listings.admittedAt), orm.desc(listings.score));
  const tiles = rows.map(toTile);
  const sale = tiles
    .filter((t) => t.pct)
    // Newest finds first, then biggest markdown.
    .sort((a, b) => Number(b.isNew) - Number(a.isNew) || (b.pct ?? 0) - (a.pct ?? 0));
  return {
    sale: brandMix(sale, (t) => t.store),
    justListed: brandMix(
      tiles.filter((t) => !t.pct),
      (t) => t.store,
    ),
  };
}

export async function savedTiles(): Promise<Tile[]> {
  const rows = await tileQuery().where(orm.isNotNull(saves.id)).orderBy(orm.desc(saves.createdAt));
  return rows.map(toTile);
}

export async function savedCount(): Promise<number> {
  const [row] = await db().select({ n: orm.count() }).from(saves);
  return row?.n ?? 0;
}

/** Rating session: mostly the best-scored unrated candidates, plus some random ones so the model sees contrast. */
export async function ratingQueue(size: number): Promise<Tile[]> {
  const base = orm.and(
    orm.eq(listings.gate, "passed"),
    orm.eq(listings.status, "active"),
    orm.isNull(ratings.verdict),
    orm.isNotNull(listings.score),
  );
  const top = await tileQuery().where(base).orderBy(orm.desc(listings.score)).limit(Math.ceil(size * 0.6));
  const explore = await tileQuery()
    .where(orm.and(base, orm.notInArray(listings.id, top.length ? top.map((r) => r.l.id) : [-1])))
    // Random but stable for the day, so reloading the session doesn't reshuffle it.
    .orderBy(orm.sql`md5(${listings.id}::text || current_date::text)`)
    .limit(size - top.length);
  return brandMix([...top, ...explore].map(toTile), (t) => t.store);
}

export async function ratedCount(): Promise<number> {
  const [row] = await db().select({ n: orm.count() }).from(ratings);
  return row?.n ?? 0;
}

export type InspoCard =
  | { kind: "pin"; id: string; image: string; href: string; board: string }
  | { kind: "listing"; tile: Tile };

/** Inspiration: clothing-board pins and listings marked "inspo", interleaved, no prices. */
export async function inspiration(): Promise<InspoCard[]> {
  const boards = Object.entries(loadPinterest().boards)
    .filter(([, use]) => use === "clothing" || use === "mood")
    .map(([slug]) => slug);
  const pinRows = await db()
    .select()
    .from(pins)
    .where(orm.inArray(pins.boardSlug, boards))
    .orderBy(orm.desc(pins.fetchedAt), pins.id);
  const inspo = (await tileQuery().where(orm.eq(ratings.verdict, "inspo")).orderBy(orm.desc(ratings.updatedAt))).map(toTile);

  const cards: InspoCard[] = [];
  const pinCards: InspoCard[] = pinRows.map((p) => ({
    kind: "pin",
    id: p.id,
    image: p.imageUrl,
    href: `https://www.pinterest.com/pin/${p.id}/`,
    board: p.boardName,
  }));
  // One saved inspo listing after every three pins.
  for (let i = 0, j = 0; i < pinCards.length || j < inspo.length; ) {
    for (let k = 0; k < 3 && i < pinCards.length; k++) cards.push(pinCards[i++]!);
    if (j < inspo.length) cards.push({ kind: "listing", tile: inspo[j++]! });
    else if (i >= pinCards.length) break;
  }
  return cards;
}

export async function listingDetail(id: number) {
  const [row] = await tileQuery().where(orm.eq(listings.id, id));
  if (!row) return null;
  const history = await db()
    .select({ priceCents: pricePoints.priceCents, seenAt: pricePoints.seenAt })
    .from(pricePoints)
    .where(orm.eq(pricePoints.listingId, id))
    .orderBy(pricePoints.seenAt);
  const [similar, gap, elsewhere] = await Promise.all([similarTo(row.l), retailGap(row.l), alsoAt(row.l)]);
  return { tile: toTile(row), listing: row.l, history, similar, gap, elsewhere };
}

async function similarTo(l: typeof listings.$inferSelect): Promise<Tile[]> {
  if (!l.embedding) return [];
  const pool = await tileQuery()
    .where(
      orm.and(
        orm.eq(listings.gate, "passed"),
        orm.eq(listings.status, "active"),
        orm.eq(listings.department, l.department),
        orm.ne(listings.id, l.id),
        orm.isNotNull(listings.embedding),
        notRejectedByOwner,
      ),
    )
    .orderBy(orm.desc(listings.score))
    .limit(600);
  const target = l.embedding;
  const dot = (v: number[]) => v.reduce((s, x, i) => s + x * (target[i] ?? 0), 0);
  return pool
    .map((r) => ({ r, sim: dot(r.l.embedding!) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 8)
    .map(({ r }) => toTile(r));
}

/** Free-text search over everything that passed the gate. Hints: "vintage", "sale", "under $N". */
export async function search(raw: string): Promise<{ sale: Tile[]; results: Tile[] }> {
  let q = raw.toLowerCase();
  const conds = [orm.eq(listings.gate, "passed"), orm.eq(listings.status, "active"), notRejectedByOwner];
  const under = q.match(/under \$?(\d+)/);
  if (under?.[1]) {
    conds.push(orm.lte(listings.priceCents, Number(under[1]) * 100));
    q = q.replace(under[0], " ");
  }
  if (/\bvintage\b|\bused\b/.test(q)) {
    conds.push(orm.eq(listings.isUsed, true));
    q = q.replace(/\bvintage\b|\bused\b/g, " ");
  }
  if (/\b(on )?sale\b/.test(q)) {
    conds.push(orm.isNotNull(listings.retailCents));
    q = q.replace(/\b(on )?sale\b/g, " ");
  }
  for (const word of q.split(/\s+/).filter((w) => w.length > 1)) {
    const like = `%${word.replace(/[%_\\]/g, "\\$&")}%`;
    conds.push(
      orm.sql`(${listings.title} ilike ${like} or ${listings.brand} ilike ${like} or ${listings.category} ilike ${like} or ${listings.store} ilike ${like} or ${listings.attributes}->>'colors' ilike ${like})`,
    );
  }
  const rows = await tileQuery()
    .where(orm.and(...conds))
    .orderBy(orm.desc(listings.score))
    .limit(120);
  const tiles = rows.map(toTile);
  return { sale: tiles.filter((t) => t.pct), results: brandMix(tiles.filter((t) => !t.pct), (t) => t.store) };
}

export type SourceStatus = {
  source: string;
  targets: number;
  ok: number;
  failing: { target: string | null; error: string }[];
  lastFinishedAt: Date | null;
  /** No finished run for 3x the source's schedule: the worker is probably down. */
  stale: boolean;
};

/** Hours between runs per source (apps/worker/src/main.ts); pipeline steps follow the 2-hour resale cycle. */
const CADENCE_HOURS: Record<string, number> = { pinterest: 24, shopify: 12, yoox: 12, digest: 24 };
/** Sources that bring in listings, as opposed to pipeline steps. */
export const SHOPPING_SOURCES = new Set(["shopify", "yoox", "ebay", "grailed", "poshmark", "vinted"]);
const JOB_TARGET = "(job)";

/** Latest run per source + target, rolled up per source for Settings and the sale-watch strip. */
export async function sourceStatus(): Promise<SourceStatus[]> {
  const latest = await db()
    .selectDistinctOn([sourceRuns.source, sourceRuns.target])
    .from(sourceRuns)
    .orderBy(sourceRuns.source, sourceRuns.target, orm.desc(sourceRuns.id));
  const now = Date.now();
  const bySource = new Map<string, SourceStatus>();
  for (const r of latest) {
    // A target that hasn't run in a week was removed from config; its last outcome no longer means anything.
    const lastActivity = (r.finishedAt ?? r.startedAt).getTime();
    if (now - lastActivity > 7 * 86_400_000) continue;
    const s = bySource.get(r.source) ?? { source: r.source, targets: 0, ok: 0, failing: [], lastFinishedAt: null, stale: false };
    // The job-level row records whole-job failures; it isn't a store or search of its own.
    if (r.target !== JOB_TARGET) s.targets++;
    const stuck = r.status === "running" && now - r.startedAt.getTime() > 3_600_000;
    if (r.status === "ok") {
      if (r.target !== JOB_TARGET) s.ok++;
    } else if (r.status === "error" || stuck) {
      s.failing.push({ target: r.target, error: stuck ? "started over an hour ago and never finished (worker killed?)" : (r.error ?? "unknown error") });
    }
    if (r.finishedAt && (!s.lastFinishedAt || r.finishedAt > s.lastFinishedAt)) s.lastFinishedAt = r.finishedAt;
    bySource.set(r.source, s);
  }
  for (const s of bySource.values()) {
    const cadence = (CADENCE_HOURS[s.source] ?? 2) * 3_600_000;
    s.stale = !s.lastFinishedAt || now - s.lastFinishedAt.getTime() > 3 * cadence;
  }
  return [...bySource.values()];
}

export async function lastSaleFind(): Promise<Tile | null> {
  const [row] = await tileQuery()
    .where(orm.and(orm.isNotNull(listings.admittedAt), orm.isNotNull(listings.retailCents), orm.eq(listings.status, "active")))
    .orderBy(orm.desc(listings.admittedAt))
    .limit(1);
  return row ? toTile(row) : null;
}

export async function countsByStore(): Promise<Map<string, number>> {
  const rows = await db()
    .select({ store: listings.store, brand: listings.brand, n: orm.count() })
    .from(listings)
    .where(orm.and(orm.eq(listings.gate, "passed"), orm.eq(listings.status, "active")))
    .groupBy(listings.store, listings.brand);
  const m = new Map<string, number>();
  for (const r of rows) {
    m.set(r.store, (m.get(r.store) ?? 0) + r.n);
    if (r.brand !== r.store) m.set(r.brand, (m.get(r.brand) ?? 0) + r.n);
  }
  return m;
}

/** "Only {brand}": everything from one brand that fits, across stores, sale first (v4 Settings behaviour). */
export async function brandView(brand: string): Promise<{ sale: Tile[]; justListed: Tile[] }> {
  const rows = await tileQuery()
    .where(
      orm.and(
        orm.eq(listings.gate, "passed"),
        orm.eq(listings.status, "active"),
        notRejectedByOwner,
        orm.sql`(lower(${listings.brand}) = lower(${brand}) or lower(${listings.store}) = lower(${brand}))`,
      ),
    )
    .orderBy(orm.desc(listings.score))
    .limit(300);
  const tiles = rows.map(toTile);
  return {
    sale: tiles.filter((t) => t.pct).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0)),
    justListed: tiles.filter((t) => !t.pct),
  };
}
