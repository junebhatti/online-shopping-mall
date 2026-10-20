import { runDigest } from "./digest/run-digest.ts";
import { runCutouts } from "./images/run-cutouts.ts";
import { ingestEbay } from "./ingest/ebay.ts";
import { ingestGrailed } from "./ingest/grailed.ts";
import { ingestPoshmark } from "./ingest/poshmark.ts";
import { ingestVinted } from "./ingest/vinted.ts";
import { ingestPinterest } from "./ingest/pinterest.ts";
import { ingestShopify } from "./ingest/shopify.ts";
import { ingestYoox } from "./ingest/yoox.ts";
import { syncWatches } from "./ingest/watches.ts";
import { log } from "./log.ts";
import { lastFinished } from "./runs.ts";
import { runAdmit } from "./taste/admit.ts";
import { runJudge } from "./taste/judge.ts";
import { runEmbed } from "./taste/run-embed.ts";
import { runGate } from "./taste/run-gate.ts";
import { runScore } from "./taste/score.ts";

type Job = { name: string; everyHours: number; run: () => Promise<void> };

// Resale every 2 hours, brand catalogs twice a day, Pinterest daily (PLAN.md).
const INGEST: Job[] = [
  { name: "pinterest", everyHours: 24, run: ingestPinterest },
  { name: "shopify", everyHours: 12, run: ingestShopify },
  { name: "yoox", everyHours: 12, run: ingestYoox },
  { name: "ebay", everyHours: 2, run: ingestEbay },
  { name: "grailed", everyHours: 2, run: ingestGrailed },
  { name: "poshmark", everyHours: 2, run: ingestPoshmark },
  { name: "vinted", everyHours: 2, run: ingestVinted },
];

const PROCESS: Job[] = [
  { name: "watches", everyHours: 0, run: syncWatches },
  { name: "gate", everyHours: 0, run: runGate },
  { name: "embed", everyHours: 0, run: runEmbed },
  { name: "score", everyHours: 0, run: runScore },
  { name: "judge", everyHours: 0, run: runJudge },
  { name: "admit", everyHours: 0, run: runAdmit },
  { name: "cutouts", everyHours: 0, run: runCutouts },
];

const args = process.argv.slice(2);
const once = args.includes("--once");
const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const selected = (jobs: Job[]) => (only ? jobs.filter((j) => only.includes(j.name)) : jobs);

async function cycle(force: boolean): Promise<void> {
  let ingested = false;
  for (const job of selected(INGEST)) {
    const last = await lastFinished(job.name);
    const due = force || !last || Date.now() - last.getTime() >= job.everyHours * 3_600_000;
    if (!due) continue;
    log.info(`running ${job.name}`);
    await job.run();
    ingested = true;
  }
  // Processing only has work to do after new data arrived.
  if (force || ingested) {
    for (const job of selected(PROCESS)) {
      log.info(`running ${job.name}`);
      await job.run();
    }
  }
  // The digest decides for itself whether it's due (once a day, after DIGEST_HOUR).
  if (!only || only.includes("digest")) await runDigest(Boolean(only?.includes("digest")));
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
