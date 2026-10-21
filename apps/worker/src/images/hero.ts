import { log } from "../log.ts";
import { cosine, embedImage, embedTexts } from "../taste/embed.ts";

const FLAT = "a product photo of a single garment laid flat or on a hanger on a plain background, no person";
const WORN = "a photo of a person wearing clothes";
// Detail shots that also read as "no person" but make terrible hero images.
const DETAIL = ["a close-up of a clothing label or tag", "a measuring tape on fabric", "an extreme close-up of fabric texture", "a shoe box"];
const MAX_CANDIDATES = 4;

let prompts: Promise<number[][]> | undefined;

/**
 * Index of the cleanest product shot among the first few images: the one that looks most like a
 * flat lay or hanger shot and least like a person wearing it. `certain` is false when some candidates failed to load.
 */
export async function pickHero(images: string[], source: string): Promise<{ index: number; certain: boolean }> {
  // Only brand stores shoot clean alternates. Resale sellers lead with their best photo and follow with
  // tags and measurements; Yoox's first image is already its front flat lay.
  if (images.length < 2 || source !== "shopify") return { index: 0, certain: true };
  const [flat, worn, ...details] = await (prompts ??= embedTexts([FLAT, WORN, ...DETAIL]));
  let best = 0;
  let bestScore = -Infinity;
  let skipped = 0;
  for (const [i, url] of images.slice(0, MAX_CANDIDATES).entries()) {
    let v: number[];
    try {
      v = await embedImage(url);
    } catch (err) {
      // An unreachable alternate shot just isn't a candidate; image 0 remains the fallback.
      log.warn(`hero: skipped image ${i} (${url})`, err instanceof Error ? err.message : err);
      skipped++;
      continue;
    }
    const score = cosine(v, flat!) - cosine(v, worn!) - Math.max(...details.map((d) => cosine(v, d)));
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  // A pick made with candidates missing isn't saved, so it's tried again next cycle.
  return { index: best, certain: skipped === 0 };
}
