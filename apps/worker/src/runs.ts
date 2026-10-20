import { db, orm, sourceRuns } from "@mall/db";
import { log } from "./log.ts";

export type RunCounts = { fetched: number; created: number; updated: number };

/**
 * Wrap one adapter run so its outcome lands in source_runs. Errors are recorded
 * and logged, then rethrown only when `rethrow` is set; one broken source must not
 * stop the rest of the cycle, but it must be visible in Settings.
 */
export async function withRun(
  source: string,
  target: string | null,
  fn: (counts: RunCounts) => Promise<void>,
): Promise<"ok" | "error"> {
  const [run] = await db().insert(sourceRuns).values({ source, target }).returning({ id: sourceRuns.id });
  if (!run) throw new Error("Failed to create source_runs row");
  const counts: RunCounts = { fetched: 0, created: 0, updated: 0 };
  try {
    await fn(counts);
    await db()
      .update(sourceRuns)
      .set({ ...counts, status: "ok", finishedAt: new Date() })
      .where(orm.eq(sourceRuns.id, run.id));
    log.info(`${source}${target ? `:${target}` : ""} ok`, counts);
    return "ok";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db()
      .update(sourceRuns)
      .set({ ...counts, status: "error", error: message.slice(0, 2000), finishedAt: new Date() })
      .where(orm.eq(sourceRuns.id, run.id));
    log.error(`${source}${target ? `:${target}` : ""} failed`, err);
    return "error";
  }
}

/** When did this source last finish successfully? Used to decide what is due. */
export async function lastOk(source: string): Promise<Date | null> {
  const [row] = await db()
    .select({ at: orm.max(sourceRuns.finishedAt) })
    .from(sourceRuns)
    .where(orm.and(orm.eq(sourceRuns.source, source), orm.eq(sourceRuns.status, "ok")));
  return row?.at ?? null;
}
