import { cutouts, db, listings, orm } from "@mall/db";
import { log } from "../log.ts";
import { makeCutout } from "./cutout.ts";
import { pickHero } from "./hero.ts";
import { assertMostlyWorked, markMediaFailed, mediaNotRecentlyFailed } from "./media-failures.ts";

const PER_CYCLE = 60;

/**
 * Cut out the feed's items first, then the best-scored candidates. Each listing's cleanest
 * product shot is chosen first (flat lay over on-model); feed items cut from a different
 * image before hero picking existed are redone.
 */
export async function runCutouts(): Promise<void> {
  const hasCutout = orm.sql`exists (select 1 from ${cutouts} c where c.listing_id = ${listings.id})`;
  const rows = await db()
    .select({ id: listings.id, images: listings.images, heroImage: listings.heroImage, hasCutout: orm.sql<boolean>`${hasCutout}` })
    .from(listings)
    .where(
      orm.and(
        orm.eq(listings.gate, "passed"),
        orm.eq(listings.status, "active"),
        orm.sql`cardinality(${listings.images}) > 0`,
        mediaNotRecentlyFailed,
        orm.or(
          orm.sql`not ${hasCutout}`,
          orm.and(orm.isNotNull(listings.admittedAt), orm.isNull(listings.heroImage)),
        ),
      ),
    )
    .orderBy(orm.sql`${listings.admittedAt} is null`, orm.desc(listings.score))
    .limit(PER_CYCLE);

  let made = 0;
  let redone = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      let hero = r.heroImage;
      if (hero === null) {
        const pick = await pickHero(r.images);
        hero = pick.index;
        if (pick.certain) await db().update(listings).set({ heroImage: hero }).where(orm.eq(listings.id, r.id));
      }
      // An existing cutout from image 0 is still right when the hero is image 0.
      if (r.hasCutout && hero === 0) continue;
      const url = r.images[hero] ?? r.images[0]!;
      const c = await makeCutout(url);
      await db()
        .insert(cutouts)
        .values({ listingId: r.id, sourceUrl: url, ...c })
        .onConflictDoUpdate({ target: cutouts.listingId, set: { sourceUrl: url, ...c, createdAt: new Date() } });
      if (r.hasCutout) redone++;
      else made++;
    } catch (err) {
      failed++;
      log.warn(`cutout failed for listing ${r.id}`, err instanceof Error ? err.message : err);
      await markMediaFailed(r.id);
    }
  }
  assertMostlyWorked("cutouts", rows.length, failed);
  log.info(`cutouts: ${made} new, ${redone} redone from a cleaner shot, ${failed} failed, ${rows.length} checked`);
}
