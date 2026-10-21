import { mkdirSync, writeFileSync } from "node:fs";
import { findSaleAlerts, markAlerted, renderAlertEmail } from "@mall/alerts";
import { REPO_ROOT, loadRules } from "@mall/config";
import { db, orm, sourceRuns } from "@mall/db";
import { fetchJson } from "@mall/sources";
import { z } from "zod";
import { log } from "../log.ts";
import { withRun } from "../runs.ts";

/**
 * Every cycle: email any saved piece or watch that just dropped enough. Nothing to send means
 * nothing happens. Unsent alerts stay pending until email works, so none are lost.
 */
export async function runAlerts(): Promise<void> {
  const siteUrl = process.env.SITE_URL?.replace(/\/$/, "");
  const alerts = await findSaleAlerts(loadRules().alerts.min_drop_pct, siteUrl);
  if (alerts.length === 0) return;

  const key = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_TO;
  // Without email configured, record the problem every 6 hours rather than every 10-minute tick.
  if ((!key || !to) && (await failedRecently(6))) return;

  await withRun("alerts", null, async (counts) => {
    counts.fetched = alerts.length;
    const email = renderAlertEmail(alerts, siteUrl);
    const dir = `${REPO_ROOT}.data/alerts`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/${new Date().toISOString().replace(/[:.]/g, "-")}.html`, email.html);
    if (!key || !to) {
      throw new Error(`${alerts.length} sale alert(s) waiting, but RESEND_API_KEY / ALERT_TO aren't set; a copy is in .data/alerts`);
    }
    const res = await fetchJson("https://api.resend.com/emails", z.object({ id: z.string() }), {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.ALERT_FROM ?? "Personal Mall <onboarding@resend.dev>",
        to: [to],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });
    await markAlerted(alerts);
    counts.created = 1;
    log.info(`sale alert sent (${res.id}): ${email.subject}`);
  });
}

async function failedRecently(hours: number): Promise<boolean> {
  const [last] = await db()
    .select({ status: sourceRuns.status, at: sourceRuns.finishedAt })
    .from(sourceRuns)
    .where(orm.eq(sourceRuns.source, "alerts"))
    .orderBy(orm.desc(sourceRuns.id))
    .limit(1);
  return last?.status === "error" && !!last.at && Date.now() - last.at.getTime() < hours * 3_600_000;
}
