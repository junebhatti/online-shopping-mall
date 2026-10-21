import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import sharp from "sharp";
import { z } from "zod";
import { db, listings, orm } from "@mall/db";
import { loadTaste, readTasteProfile } from "@mall/config";
import { fetchImage } from "../images/fetch.ts";
import { markMediaFailed, mediaNotRecentlyFailed } from "../images/media-failures.ts";
import { log } from "../log.ts";
import { withRun } from "../runs.ts";

const Verdicts = z.object({
  items: z.array(
    z.object({
      id: z.number(),
      verdict: z.enum(["admit", "skip"]),
      fit: z.number(),
      note: z.string(),
      name: z.string(),
    }),
  ),
});

const INSTRUCTIONS = `You curate a personal shopping feed for one person. Their taste profile is below.
For each listing you get a photo and its details. Decide whether it belongs in their feed.

Be selective: the feed admits about 20 pieces a day and missing something is better than showing junk.
Admit only pieces that fit the profile's silhouettes, palette, materials and references.
Skip anything the profile rules out, anything generic or logo-led, and anything you would not expect them to wear.
"fit" is 1-10 for how well it matches the profile. "note" is under 12 words, for the owner, about why.
"name" is what the piece is, 2-5 words, from the photo: colour, material or detail, and garment type,
e.g. "Navy canvas chore jacket" or "Grey pinstripe pleated trousers". No brand, no size.
Return one entry per listing id you were given.`;

/** Ask Claude to judge the highest-scoring passed listings that haven't been judged yet. */
export async function runJudge(): Promise<void> {
  const taste = loadTaste();
  await withRun("judge", taste.judge.model, async (counts) => {
    const client = new Anthropic();
    const candidates = await db()
      .select()
      .from(listings)
      .where(
        orm.and(
          orm.eq(listings.gate, "passed"),
          orm.eq(listings.status, "active"),
          orm.isNull(listings.judgeVerdict),
          orm.isNotNull(listings.score),
          mediaNotRecentlyFailed,
        ),
      )
      // Pieces already in the feed (admitted before the judge worked) are judged first.
      .orderBy(orm.sql`${listings.admittedAt} is null`, orm.desc(listings.score))
      .limit(taste.judge.batch_size);
    counts.fetched = candidates.length;
    if (candidates.length === 0) return;

    // Names come "from the photo", so a piece whose photo won't load waits for a later cycle.
    const content: Anthropic.ContentBlockParam[] = [];
    const sent: typeof candidates = [];
    for (const l of candidates) {
      const url = l.images[l.heroImage ?? 0] ?? l.images[0];
      const image = url ? await thumbnail(url) : null;
      if (!image) {
        await markMediaFailed(l.id);
        continue;
      }
      content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } });
      content.push({ type: "text", text: describe(l) });
      sent.push(l);
    }
    if (sent.length === 0) throw new Error(`none of ${candidates.length} candidate photos could be fetched`);
    content.push({
      type: "text",
      text: `Return exactly ${sent.length} entries, one for each of these listing ids: ${sent.map((l) => l.id).join(", ")}.`,
    });

    const response = await client.messages.parse({
      model: taste.judge.model,
      max_tokens: 8000,
      output_config: { effort: "low", format: zodOutputFormat(Verdicts) },
      system: [
        { type: "text", text: `${INSTRUCTIONS}\n\n<taste_profile>\n${readTasteProfile()}\n</taste_profile>`, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content }],
    });

    if (response.stop_reason === "refusal") {
      throw new Error(`Judge refused: ${response.stop_details?.category ?? "no category"}`);
    }
    if (response.stop_reason === "max_tokens") throw new Error("Judge hit max_tokens; lower judge.batch_size");
    const parsed = response.parsed_output;
    if (!parsed) throw new Error("Judge returned no parseable verdicts");

    const ids = new Set(sent.map((c) => c.id));
    for (const v of parsed.items) {
      if (!ids.has(v.id)) {
        log.warn(`judge returned unknown id ${v.id}`);
        continue;
      }
      await db()
        .update(listings)
        .set({
          judgeVerdict: v.verdict,
          judgeFit: Math.max(1, Math.min(10, Math.round(v.fit))),
          judgeNote: v.note.slice(0, 200),
          displayName: v.name.trim().slice(0, 60) || null,
        })
        .where(orm.eq(listings.id, v.id));
      counts.updated++;
    }
    // An empty or mostly missing answer would leave admission waiting on verdicts that never come.
    if (counts.updated < Math.ceil(sent.length / 2)) {
      throw new Error(`judge returned verdicts for only ${counts.updated} of ${sent.length} pieces`);
    }
    log.info("judge usage", response.usage);
  });
}

function describe(l: typeof listings.$inferSelect): string {
  const a = l.attributes;
  const parts = [
    `Listing id ${l.id}`,
    `${l.brand}: ${l.title}`,
    `category ${l.category}`,
    `$${(l.priceCents / 100).toFixed(0)}${l.retailCents ? ` (was $${(l.retailCents / 100).toFixed(0)})` : ""}`,
    a.matchedSize ? `size ${a.matchedSize}` : null,
    l.isUsed ? `used, ${l.condition ?? "condition unknown"}` : "new",
    a.measurements && Object.keys(a.measurements).length ? `measurements ${JSON.stringify(a.measurements)}` : null,
    a.colors?.length ? `colors ${a.colors.slice(0, 4).join(", ")}` : null,
    `from ${l.store}`,
  ];
  return parts.filter(Boolean).join(" | ");
}

async function thumbnail(url: string): Promise<string | null> {
  try {
    const buf = await fetchImage(url, 512);
    return (await sharp(buf).resize(384, 384, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer()).toString("base64");
  } catch (err) {
    log.warn(`judge: photo unavailable, piece skipped until tomorrow (${url})`, err instanceof Error ? err.message : err);
    return null;
  }
}
