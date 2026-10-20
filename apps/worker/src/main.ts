import { ingestEbay } from "./ingest/ebay.ts";
import { ingestPinterest } from "./ingest/pinterest.ts";
import { ingestShopify } from "./ingest/shopify.ts";
import { log } from "./log.ts";
import { lastOk } from "./runs.ts";
import { runGate } from "./taste/run-gate.ts";

type Job = { name: string; everyHours: number; run: () => Promise<void> };

// Resale every 2 hours, brand catalogs twice a day, Pinterest daily (PLAN.md).
const INGEST: Job[] = [
  { name: "pinterest", everyHours: 24, run: ingestPinterest },
  { name: "shopify", everyHours: 12, run: ingestShopify },
  { name: "ebay", everyHours: 2, run: ingestEbay },
];

const PROCESS: Job[] = [{ name: "gate", everyHours: 0, run: runGate }];

const args = process.argv.slice(2);
const once = args.includes("--once");
const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const selected = (jobs: Job[]) => (only ? jobs.filter((j) => only.includes(j.name)) : jobs);

async function cycle(force: boolean): Promise<void> {
  for (const job of selected(INGEST)) {
    const last = await lastOk(job.name);
    const due = force || !last || Date.now() - last.getTime() >= job.everyHours * 3_600_000;
    if (!due) continue;
    log.info(`running ${job.name}`);
    await job.run();
  }
  for (const job of selected(PROCESS)) {
    log.info(`running ${job.name}`);
    await job.run();
  }
}

if (once) {
  await cycle(true);
  process.exit(0);
}

log.info("worker started; checking every 10 minutes for due jobs");
for (;;) {
  try {
    await cycle(false);
  } catch (err) {
    // A crash inside one cycle is logged and retried next tick, never silently dropped.
    log.error("cycle failed", err);
  }
  await new Promise((r) => setTimeout(r, 10 * 60_000));
}
