import { db, listings, orm, ratings, saves, sourceRuns } from "@mall/db";
import { loadRules, loadTaste } from "@mall/config";
import { log } from "../log.ts";

/**
 * Let the best candidates into the feed, about `daily_limit` per 24 hours.
 * With a working judge only "admit" verdicts qualify; without one, a score floor applies.
 */
export async function runAdmit(): Promise<void> {
  const rules = loadRules();
  const taste = loadTaste();
  const since = new Date(Date.now() - 24 * 3_600_000);
  const judgeWorks = await judgeIsWorking();
  if (judgeWorks) await dropJudgedOut(taste.judge.min_fit);

  const [{ first, recent }] = (await db()
    .select({
      first: orm.min(listings.admittedAt),
      recent: orm.sql<number>`count(*) filter (where ${listings.admittedAt} >= ${since.toISOString()}::timestamptz)`.mapWith(Number),
    })
    .from(listings)) as [{ first: Date | null; recent: number }];

  // The first day can fill up to initial_backfill so the feed doesn't start nearly empty.
  const firstDay = !first || first >= since;
  const budget = Math.max(rules.admission.daily_limit, firstDay ? taste.admission.initial_backfill : 0) - recent;
  if (budget <= 0) {
    log.info("admit: daily limit reached");
    return;
  }

  const eligible = await db()
    .select({ id: listings.id, store: listings.store, title: listings.title, brand: listings.brand, source: listings.source })
    .from(listings)
    .where(
      orm.and(
        orm.eq(listings.gate, "passed"),
        orm.eq(listings.status, "active"),
        orm.isNull(listings.admittedAt),
        orm.isNotNull(listings.score),
        judgeWorks
          ? orm.and(orm.eq(listings.judgeVerdict, "admit"), orm.gte(listings.judgeFit, taste.judge.min_fit))
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
    // Marketplaces (Grailed, eBay) hold thousands of sellers, so their cap applies per brand instead.
    const capKey = l.source === "shopify" ? l.store : `${l.store}:${l.brand.toLowerCase()}`;
    if (seenTitles.has(key) || (perStore.get(capKey) ?? 0) >= perStoreCap) continue;
    seenTitles.add(key);
    perStore.set(capKey, (perStore.get(capKey) ?? 0) + 1);
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

/**
 * Pieces let in before the judge worked, that it has since scored below min_fit, leave the feed.
 * Anything the owner saved or rated stays.
 */
async function dropJudgedOut(minFit: number): Promise<void> {
  const dropped = await db()
    .update(listings)
    .set({ admittedAt: null })
    .where(
      orm.and(
        orm.isNotNull(listings.admittedAt),
        orm.or(orm.eq(listings.judgeVerdict, "skip"), orm.lt(listings.judgeFit, minFit)),
        orm.sql`not exists (select 1 from ${saves} s where s.listing_id = ${listings.id})`,
        orm.sql`not exists (select 1 from ${ratings} r where r.listing_id = ${listings.id})`,
      ),
    )
    .returning({ id: listings.id });
  if (dropped.length) log.info(`admit: ${dropped.length} pieces left the feed after the judge scored them below ${minFit}`);
}
