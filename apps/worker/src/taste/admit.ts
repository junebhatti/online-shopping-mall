import { db, listings, orm, sourceRuns } from "@mall/db";
import { loadRules, loadTaste } from "../config.ts";
import { log } from "../log.ts";

/**
 * Let the best candidates into the feed, about `daily_limit` per 24 hours.
 * With a working judge only "admit" verdicts qualify; without one, a score floor applies.
 */
export async function runAdmit(): Promise<void> {
  const rules = loadRules();
  const taste = loadTaste();
  const since = new Date(Date.now() - 24 * 3_600_000);

  const [{ total, recent }] = (await db()
    .select({
      total: orm.count(listings.admittedAt),
      recent: orm.sql<number>`count(*) filter (where ${listings.admittedAt} >= ${since.toISOString()}::timestamptz)`.mapWith(Number),
    })
    .from(listings)) as [{ total: number; recent: number }];

  const budget = total === 0 ? taste.admission.initial_backfill : rules.admission.daily_limit - recent;
  if (budget <= 0) {
    log.info("admit: daily limit reached");
    return;
  }

  const judgeWorks = await judgeIsWorking();
  const eligible = await db()
    .select({ id: listings.id, store: listings.store, title: listings.title })
    .from(listings)
    .where(
      orm.and(
        orm.eq(listings.gate, "passed"),
        orm.eq(listings.status, "active"),
        orm.isNull(listings.admittedAt),
        orm.isNotNull(listings.score),
        judgeWorks
          ? orm.eq(listings.judgeVerdict, "admit")
          : orm.gte(listings.score, taste.judge.min_score_without_judge),
      ),
    )
    .orderBy(orm.desc(orm.sql`coalesce(${listings.judgeFit}, 0)`), orm.desc(listings.score))
    .limit(budget * 10);

  const perStoreCap = Math.max(1, Math.floor(budget * taste.admission.max_share_per_store));
  const perStore = new Map<string, number>();
  // Same product listed twice by a store (Alo; LA Apparel "Unisex"/"Mix" copies) only gets in once.
  const admitted = await db()
    .select({ store: listings.store, title: listings.title })
    .from(listings)
    .where(orm.isNotNull(listings.admittedAt));
  const seenTitles = new Set(admitted.map((a) => productKey(a.store, a.title)));
  const chosen: number[] = [];
  for (const l of eligible) {
    if (chosen.length >= budget) break;
    const key = productKey(l.store, l.title);
    if (seenTitles.has(key) || (perStore.get(l.store) ?? 0) >= perStoreCap) continue;
    seenTitles.add(key);
    perStore.set(l.store, (perStore.get(l.store) ?? 0) + 1);
    chosen.push(l.id);
  }

  if (chosen.length) {
    await db().update(listings).set({ admittedAt: new Date() }).where(orm.inArray(listings.id, chosen));
  }
  log.info(`admit: ${chosen.length} of budget ${budget} (${judgeWorks ? "judge" : "score floor, no judge"})`, Object.fromEntries(perStore));
}

async function judgeIsWorking(): Promise<boolean> {
  const [last] = await db()
    .select({ status: sourceRuns.status })
    .from(sourceRuns)
    .where(orm.eq(sourceRuns.source, "judge"))
    .orderBy(orm.desc(sourceRuns.id))
    .limit(1);
  if (last?.status !== "ok") log.warn("admit: judge unavailable (see Settings > Sources); using score floor only");
  return last?.status === "ok";
}

export function productKey(store: string, title: string): string {
  const t = title
    .toLowerCase()
    .replace(/\b(unisex|mix|men'?s|mens)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return `${store}|${t}`;
}
