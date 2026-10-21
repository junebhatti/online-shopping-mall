import { mkdirSync, writeFileSync } from "node:fs";
import { REPO_ROOT } from "@mall/config";
import { buildDigest } from "@mall/digest";
import { fetchJson } from "@mall/sources";
import { z } from "zod";
import { log } from "../log.ts";
import { lastFinished, withRun } from "../runs.ts";

function sendHour(): number {
  const raw = process.env.DIGEST_HOUR ?? "8";
  const hour = Number(raw);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error(`DIGEST_HOUR must be a whole hour 0-23, got "${raw}"`);
  return hour;
}

/** Once a day after DIGEST_HOUR (local time): build the digest, keep a copy, email it via Resend. */
export async function runDigest(force = false): Promise<void> {
  // Once a day whether or not sending worked, so a missing key doesn't retry every tick.
  const last = await lastFinished("digest");
  const due = !last || Date.now() - last.getTime() > 20 * 3_600_000;
  if (!force && (!due || new Date().getHours() < sendHour())) return;

  await withRun("digest", null, async (counts) => {
    const digest = await buildDigest(process.env.SITE_URL?.replace(/\/$/, ""));
    counts.fetched = digest.drops.length + digest.fresh.length;
    const dir = `${REPO_ROOT}.data/digests`;
    mkdirSync(dir, { recursive: true });
    const file = `${dir}/${new Date().toISOString().slice(0, 10)}.html`;
    writeFileSync(file, digest.html);

    const key = process.env.RESEND_API_KEY;
    const to = process.env.DIGEST_TO;
    // Checked even on quiet days, so an unconfigured digest shows in Settings.
    if (!key || !to) throw new Error(`RESEND_API_KEY / DIGEST_TO not set; today's digest was saved to .data/digests instead`);
    if (digest.empty) {
      log.info("digest: quiet day and no problems, nothing to send");
      return;
    }

    const res = await fetchJson("https://api.resend.com/emails", z.object({ id: z.string() }), {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.DIGEST_FROM ?? "Personal Mall <onboarding@resend.dev>",
        to: [to],
        subject: digest.subject,
        html: digest.html,
        text: digest.text,
      }),
    });
    counts.created = 1;
    log.info(`digest sent (${res.id}): ${digest.subject}`);
  });
}
