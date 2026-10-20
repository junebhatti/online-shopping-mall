import { loadWatches } from "@mall/config";
import { db, listings, orm, watches } from "@mall/db";
import { log } from "../log.ts";

/** Mirror config/watches.yaml into the watches table (matched by label), then update each watch's best match. */
export async function syncWatches(): Promise<void> {
  await mirrorWatchConfig();
  await trackWatches();
}

async function mirrorWatchConfig(): Promise<void> {
  const wanted = loadWatches();
  const existing = await db().select().from(watches);
  for (const w of wanted) {
    const row = existing.find((e) => e.label === w.label);
    const values = {
      label: w.label,
      query: w.query,
      department: w.department,
      maxPriceCents: w.max_price_usd ? Math.round(w.max_price_usd * 100) : null,
      active: true,
    };
    if (row) await db().update(watches).set(values).where(orm.eq(watches.id, row.id));
    else await db().insert(watches).values(values);
  }
  const labels = new Set(wanted.map((w) => w.label));
  for (const e of existing) {
    if (!labels.has(e.label) && e.active) await db().update(watches).set({ active: false }).where(orm.eq(watches.id, e.id));
  }
  log.info(`watches: ${wanted.length} active`);
}

const STOP = new Set(["the", "and", "for", "with", "cologne", "edp", "edt", "ml"]);

/** Point each watch at the cheapest active listing whose title/brand contains every query word. */
export async function trackWatches(): Promise<void> {
  const active = await db().select().from(watches).where(orm.eq(watches.active, true));
  for (const w of active) {
    const words = w.query
      .toLowerCase()
      .split(/\s+/)
      .filter((x) => x.length > 2 && !STOP.has(x));
    if (words.length === 0) continue;
    const [best] = await db()
      .select({ id: listings.id, priceCents: listings.priceCents, store: listings.store })
      .from(listings)
      .where(
        orm.and(
          orm.eq(listings.status, "active"),
          orm.eq(listings.department, w.department),
          ...words.map((x) => orm.sql`(${listings.title} || ' ' || ${listings.brand}) ilike ${`%${x}%`}`),
        ),
      )
      .orderBy(listings.priceCents)
      .limit(1);
    await db().update(watches).set({ bestListingId: best?.id ?? null }).where(orm.eq(watches.id, w.id));
    log.info(`watch "${w.label}": ${best ? `$${best.priceCents / 100} at ${best.store}` : "no match yet"}`);
  }
}
