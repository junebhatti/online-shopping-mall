import { db, listings, orm } from "@mall/db";
import { loadBrands, loadRules } from "../config.ts";
import { log } from "../log.ts";
import { gate } from "./gate.ts";

/** Apply the hard rules to every pending listing. */
export async function runGate(): Promise<void> {
  const rules = loadRules();
  const brands = new Map(loadBrands().map((b) => [b.name, b]));
  const pending = await db()
    .select()
    .from(listings)
    .where(orm.and(orm.eq(listings.gate, "pending"), orm.eq(listings.status, "active")));

  const tally: Record<string, number> = {};
  for (const l of pending) {
    const brand = l.source === "shopify" ? brands.get(l.store) : undefined;
    const result = gate(l, rules, brand);
    const key = result.passed ? "passed" : result.reason;
    tally[key] = (tally[key] ?? 0) + 1;
    await db()
      .update(listings)
      .set(
        result.passed
          ? { gate: "passed", gateReason: null, attributes: { ...l.attributes, matchedSize: result.matchedSize } }
          : { gate: "rejected", gateReason: result.reason },
      )
      .where(orm.eq(listings.id, l.id));
  }
  log.info(`gate: ${pending.length} checked`, tally);
}
