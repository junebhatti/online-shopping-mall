import { cutouts, db, listings, orm } from "@mall/db";
import { log } from "../log.ts";
import { makeCutout } from "./cutout.ts";

const PER_CYCLE = 60;

/** Cut out the feed's items first, then the best-scored candidates that the rating session will show. */
export async function runCutouts(): Promise<void> {
  const missing = orm.sql`not exists (select 1 from ${cutouts} c where c.listing_id = ${listings.id})`;
  const rows = await db()
    .select({ id: listings.id, url: orm.sql<string>`${listings.images}[1]` })
    .from(listings)
    .where(
      orm.and(
        orm.eq(listings.gate, "passed"),
        orm.eq(listings.status, "active"),
        orm.sql`cardinality(${listings.images}) > 0`,
        missing,
      ),
    )
    .orderBy(orm.sql`${listings.admittedAt} is null`, orm.desc(listings.score))
    .limit(PER_CYCLE);

  let done = 0;
  for (const r of rows) {
    try {
      const c = await makeCutout(r.url);
      await db().insert(cutouts).values({ listingId: r.id, sourceUrl: r.url, ...c }).onConflictDoNothing();
      done++;
    } catch (err) {
      log.warn(`cutout failed for listing ${r.id} (${r.url})`, err instanceof Error ? err.message : err);
    }
  }
  log.info(`cutouts: ${done} of ${rows.length}`);
}
