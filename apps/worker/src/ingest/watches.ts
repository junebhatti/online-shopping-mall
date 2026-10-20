import { loadWatches } from "@mall/config";
import { db, orm, watches } from "@mall/db";
import { log } from "../log.ts";

/** Mirror config/watches.yaml into the watches table (matched by label). */
export async function syncWatches(): Promise<void> {
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
