import { db, listings, orm, saves } from "@mall/db";
import { loadSources } from "@mall/config";
import { HttpError, grailedListingStatus, poshmarkListingStatus, sleep } from "@mall/sources";
import { log } from "../log.ts";
import { withRun } from "../runs.ts";

const PER_SOURCE = 100;
const VINTED_MAX_AGE_DAYS = 14;

const inFeedOrSaved = orm.or(
  orm.isNotNull(listings.admittedAt),
  orm.sql`exists (select 1 from ${saves} s where s.listing_id = ${listings.id})`,
);

/**
 * Resale searches only show new listings, so a sold piece would otherwise stay "active" forever.
 * Feed and saved pieces are re-checked where the marketplace allows a single-listing lookup
 * (Grailed's live search index, Poshmark's post endpoint). Vinted's detail pages are behind Cloudflare, so unsaved Vinted pieces age out instead.
 */
export async function recheckResale(): Promise<void> {
  const grailed = loadSources().grailed;
  await recheck("grailed", (id) => grailedListingStatus(grailed, id));
  await recheck("poshmark", poshmarkListingStatus);

  const aged = await db()
    .update(listings)
    .set({ status: "removed", updatedAt: new Date() })
    .where(
      orm.and(
        orm.eq(listings.source, "vinted"),
        orm.eq(listings.status, "active"),
        orm.isNotNull(listings.admittedAt),
        orm.lt(listings.firstSeenAt, new Date(Date.now() - VINTED_MAX_AGE_DAYS * 86_400_000)),
        orm.sql`not exists (select 1 from ${saves} s where s.listing_id = ${listings.id})`,
      ),
    )
    .returning({ id: listings.id });
  if (aged.length) log.info(`recheck: ${aged.length} unsaved Vinted pieces older than ${VINTED_MAX_AGE_DAYS} days left the feed`);
}

async function recheck(source: string, status: (externalId: string) => Promise<"active" | "sold" | "removed">): Promise<void> {
  const rows = await db()
    .select({ id: listings.id, externalId: listings.externalId })
    .from(listings)
    .where(orm.and(orm.eq(listings.source, source), orm.eq(listings.status, "active"), inFeedOrSaved))
    .orderBy(listings.lastSeenAt)
    .limit(PER_SOURCE);
  if (rows.length === 0) return;
  await withRun(source, "recheck feed and saved", async (counts) => {
    counts.fetched = rows.length;
    for (const r of rows) {
      let next: "active" | "sold" | "removed";
      try {
        next = await status(r.externalId);
      } catch (err) {
        // A listing that no longer exists is gone; any other error is a real failure for this run.
        if (err instanceof HttpError && err.status === 404) next = "removed";
        else throw err;
      }
      await db()
        .update(listings)
        .set(next === "active" ? { lastSeenAt: new Date() } : { status: next, updatedAt: new Date() })
        .where(orm.eq(listings.id, r.id));
      if (next !== "active") counts.updated++;
      await sleep(300);
    }
  });
}
