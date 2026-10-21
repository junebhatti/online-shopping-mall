import { db, listings, orm } from "@mall/db";

/** Listings whose images just failed rest for a day, so a dead image can't hog every batch. */
export const mediaNotRecentlyFailed = orm.sql`coalesce((${listings.attributes}->>'mediaFailedAt')::timestamptz, 'epoch'::timestamptz) < now() - interval '24 hours'`;

export async function markMediaFailed(id: number): Promise<void> {
  await db()
    .update(listings)
    .set({ attributes: orm.sql`${listings.attributes} || jsonb_build_object('mediaFailedAt', now()::text)` })
    .where(orm.eq(listings.id, id));
}

/** More than half of a reasonably sized batch failing is a broken stage, not bad luck. */
export function assertMostlyWorked(stage: string, attempted: number, failed: number): void {
  if (attempted >= 5 && failed > attempted / 2) {
    throw new Error(`${stage}: ${failed} of ${attempted} failed (image host down, or the model didn't load?)`);
  }
}
