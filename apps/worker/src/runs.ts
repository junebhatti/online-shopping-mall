import { db, orm, sourceRuns } from "@mall/db";
import { log } from "./log.ts";

export type RunCounts = { fetched: number; created: number; updated: number };

/**
 * Wrap one adapter run so its outcome lands in source_runs. Errors are recorded and logged,
 * not rethrown: one broken source must not stop the rest of the cycle, but it must be
 * visible in Settings.
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
    // Log the original error first so it survives even if recording it fails.
    log.error(`${source}${target ? `:${target}` : ""} failed`, err);
    const message = err instanceof Error ? err.message : String(err);
    try {
      await db()
        .update(sourceRuns)
        .set({ ...counts, status: "error", error: message.slice(0, 2000), finishedAt: new Date() })
        .where(orm.eq(sourceRuns.id, run.id));
    } catch (recordErr) {
      log.error(`could not record the failure of ${source} in source_runs`, recordErr);
    }
    return "error";
  }
}

/** Target used for job-level outcomes (a failure outside any per-target run, e.g. bad config). */
export const JOB_TARGET = "(job)";

/**
 * Run a whole job so a throw is recorded instead of aborting the cycle. A later success
 * writes an ok row for the job target, which clears the failure in Settings.
 */
export async function runJob(name: string, fn: () => Promise<void>): Promise<"ok" | "error"> {
  try {
    await fn();
  } catch (err) {
    return withRun(name, JOB_TARGET, async () => {
      throw err;
    });
  }
  await clearIfFailing(name, JOB_TARGET);
  return "ok";
}

/** Write an ok row for a target whose latest recorded outcome was an error, so Settings stops showing it. */
export async function clearIfFailing(source: string, target: string): Promise<void> {
  const [last] = await db()
    .select({ status: sourceRuns.status })
    .from(sourceRuns)
    .where(orm.and(orm.eq(sourceRuns.source, source), orm.eq(sourceRuns.target, target)))
    .orderBy(orm.desc(sourceRuns.id))
    .limit(1);
  if (last?.status === "error") await withRun(source, target, async () => {});
}

/** When did this source last finish successfully? Used to decide what is due. */
export async function lastOk(source: string): Promise<Date | null> {
  const [row] = await db()
    .select({ at: orm.max(sourceRuns.finishedAt) })
    .from(sourceRuns)
    .where(orm.and(orm.eq(sourceRuns.source, source), orm.eq(sourceRuns.status, "ok")));
  return row?.at ?? null;
}

/** When did this source last finish, ok or not? A failing source waits its cadence before retrying. */
export async function lastFinished(source: string): Promise<Date | null> {
  const [row] = await db()
    .select({ at: orm.max(sourceRuns.finishedAt) })
    .from(sourceRuns)
    .where(orm.eq(sourceRuns.source, source));
  return row?.at ?? null;
}
