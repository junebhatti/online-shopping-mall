import { log } from "../log.ts";
import { cosine, embedImage, embedTexts } from "../taste/embed.ts";

const FLAT = "a product photo of a single garment laid flat or on a hanger on a plain background, no person";
const WORN = "a photo of a person wearing clothes";
const MAX_CANDIDATES = 4;

let prompts: Promise<number[][]> | undefined;

/**
 * Index of the cleanest product shot among the first few images: the one that looks most like a
 * flat lay or hanger shot and least like a person wearing it. Falls back to 0 on any image failure.
 */
export async function pickHero(images: string[]): Promise<number> {
  if (images.length < 2) return 0;
  const [flat, worn] = await (prompts ??= embedTexts([FLAT, WORN]));
  let best = 0;
  let bestScore = -Infinity;
  for (const [i, url] of images.slice(0, MAX_CANDIDATES).entries()) {
    let v: number[];
    try {
      v = await embedImage(url);
    } catch (err) {
      // An unreachable alternate shot just isn't a candidate; image 0 remains the fallback.
      log.warn(`hero: skipped image ${i} (${url})`, err instanceof Error ? err.message : err);
      continue;
    }
    const score = cosine(v, flat!) - cosine(v, worn!);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}
