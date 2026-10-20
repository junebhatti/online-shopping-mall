import { db, listings, orm, pins, ratings } from "@mall/db";
import { loadPinterest, loadTaste, type TasteConfig } from "@mall/config";
import { hasWord } from "./gate.ts";
import { log } from "../log.ts";
import { cosine, embedTexts } from "./embed.ts";

type Component = keyof TasteConfig["weights"];

const topkMean = (values: number[], k: number) => {
  const top = [...values].sort((a, b) => b - a).slice(0, k);
  return top.length ? top.reduce((s, x) => s + x, 0) / top.length : 0;
};

/**
 * Score every passed listing. Each signal is z-scored across the pool so the
 * weights in config/taste.yaml are comparable; ratings join once any exist.
 */
export async function runScore(): Promise<void> {
  const taste = loadTaste();
  const clothingBoards = Object.entries(loadPinterest().boards)
    .filter(([, use]) => use === "clothing")
    .map(([slug]) => slug);

  const pinVecs = (
    await db()
      .select({ e: pins.embedding })
      .from(pins)
      .where(orm.and(orm.inArray(pins.boardSlug, clothingBoards), orm.isNotNull(pins.embedding)))
  ).map((r) => r.e!);
  const [wantVecs, avoidVecs] = await Promise.all([embedTexts(taste.want), taste.avoid.length ? embedTexts(taste.avoid) : []]);

  const rated = await db()
    .select({ verdict: ratings.verdict, e: listings.embedding })
    .from(ratings)
    .innerJoin(listings, orm.eq(ratings.listingId, listings.id))
    .where(orm.isNotNull(listings.embedding));
  const byVerdict = (v: string) => rated.filter((r) => r.verdict === v).map((r) => r.e!);
  const [wearVecs, notVecs, inspoVecs] = [byVerdict("wear"), byVerdict("not"), byVerdict("inspo")];

  const pool = await db()
    .select({ id: listings.id, e: listings.embedding })
    .from(listings)
    .where(orm.and(orm.eq(listings.gate, "passed"), orm.eq(listings.status, "active"), orm.isNotNull(listings.embedding)));

  if (pinVecs.length === 0) log.warn("score: no clothing pin embeddings yet; pins signal skipped");

  const raw = pool.map(({ id, e }) => {
    const v = e!;
    const sims = (vecs: number[][]) => vecs.map((x) => cosine(v, x));
    const c: Partial<Record<Component, number>> = { want: Math.max(...sims(wantVecs)) };
    if (pinVecs.length) c.pins = topkMean(sims(pinVecs), 5);
    if (avoidVecs.length) c.avoid = Math.max(...sims(avoidVecs));
    if (wearVecs.length) c.wear = topkMean(sims(wearVecs), 3);
    if (notVecs.length) c.not = topkMean(sims(notVecs), 3);
    if (inspoVecs.length) c.inspo = topkMean(sims(inspoVecs), 3);
    return { id, c };
  });

  const stats = new Map<Component, { mean: number; sd: number }>();
  for (const key of Object.keys(taste.weights) as Component[]) {
    const xs = raw.map((r) => r.c[key]).filter((x): x is number => x !== undefined);
    if (xs.length < 2) continue;
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length) || 1;
    stats.set(key, { mean, sd });
  }
  const sign: Record<Component, number> = { pins: 1, want: 1, avoid: -1, wear: 1, not: -1, inspo: 1 };

  for (const { id, c } of raw) {
    let score = 0;
    for (const [key, value] of Object.entries(c) as [Component, number][]) {
      const s = stats.get(key);
      if (s) score += sign[key] * taste.weights[key] * ((value - s.mean) / s.sd);
    }
    await db().update(listings).set({ score }).where(orm.eq(listings.id, id));
  }

  // Fragrance: name match against favourites, no images involved.
  const fragrances = await db()
    .select({ id: listings.id, title: listings.title })
    .from(listings)
    .where(orm.and(orm.eq(listings.gate, "passed"), orm.eq(listings.department, "fragrance")));
  for (const f of fragrances) {
    const fav = taste.fragrance_favorites.some((w) => hasWord(f.title, w));
    await db().update(listings).set({ score: fav ? 2 : -1 }).where(orm.eq(listings.id, f.id));
  }

  log.info(`score: ${raw.length} clothing, ${fragrances.length} fragrance`, {
    signals: [...stats.keys()].join(","),
    ratings: rated.length,
  });
}
