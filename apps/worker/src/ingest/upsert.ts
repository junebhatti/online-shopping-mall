import { db, listings, orm, pricePoints } from "@mall/db";
import type { NormalizedListing } from "@mall/sources";
import type { RunCounts } from "../runs.ts";

/**
 * Insert or refresh a listing. A price change writes a price point and sends the
 * listing back through the gate (a markdown can make it pass a ceiling).
 */
export async function upsertListing(l: NormalizedListing, counts: RunCounts): Promise<number> {
  const now = new Date();
  const [existing] = await db()
    .select({ id: listings.id, priceCents: listings.priceCents })
    .from(listings)
    .where(orm.and(orm.eq(listings.source, l.source), orm.eq(listings.externalId, l.externalId)));

  if (!existing) {
    const [row] = await db()
      .insert(listings)
      .values({ ...l, firstSeenAt: now, lastSeenAt: now, updatedAt: now })
      .returning({ id: listings.id });
    if (!row) throw new Error(`Insert failed for ${l.source}:${l.externalId}`);
    await db().insert(pricePoints).values({ listingId: row.id, priceCents: l.priceCents, seenAt: now });
    counts.created++;
    return row.id;
  }

  const priceChanged = existing.priceCents !== l.priceCents;
  await db()
    .update(listings)
    .set({
      ...l,
      status: "active",
      lastSeenAt: now,
      updatedAt: now,
      ...(priceChanged ? { gate: "pending" as const, gateReason: null } : {}),
    })
    .where(orm.eq(listings.id, existing.id));
  if (priceChanged) {
    await db().insert(pricePoints).values({ listingId: existing.id, priceCents: l.priceCents, seenAt: now });
  }
  counts.updated++;
  return existing.id;
}

/** Listings from a full-catalog source that weren't seen this run are gone (sold out or removed). */
export async function markUnseenRemoved(source: string, store: string, since: Date): Promise<void> {
  await db()
    .update(listings)
    .set({ status: "removed", updatedAt: new Date() })
    .where(
      orm.and(
        orm.eq(listings.source, source),
        orm.eq(listings.store, store),
        orm.eq(listings.status, "active"),
        orm.lt(listings.lastSeenAt, since),
      ),
    );
}

/** Cheap refresh for a known listing: bump last-seen, and record a price change if any. */
export async function refreshKnownPrice(
  source: string,
  externalId: string,
  priceCents: number,
  counts: RunCounts,
): Promise<void> {
  const [row] = await db()
    .select({ id: listings.id, priceCents: listings.priceCents })
    .from(listings)
    .where(orm.and(orm.eq(listings.source, source), orm.eq(listings.externalId, externalId)));
  if (!row) return;
  const now = new Date();
  const changed = row.priceCents !== priceCents;
  await db()
    .update(listings)
    .set({
      lastSeenAt: now,
      status: "active",
      ...(changed ? { priceCents, updatedAt: now, gate: "pending" as const, gateReason: null } : {}),
    })
    .where(orm.eq(listings.id, row.id));
  if (changed) await db().insert(pricePoints).values({ listingId: row.id, priceCents, seenAt: now });
  counts.updated++;
}
