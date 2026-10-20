import {
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  RawImage,
  env,
} from "@huggingface/transformers";
import { REPO_ROOT } from "../config.ts";
import { fetchImage } from "../images/fetch.ts";

/** Change this and every embedding is recomputed (rows store the model they were made with). */
export const EMBEDDING_MODEL = "Xenova/clip-vit-base-patch32";

env.cacheDir = `${REPO_ROOT}.cache/models`;

type Loaded = {
  processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
  vision: Awaited<ReturnType<typeof CLIPVisionModelWithProjection.from_pretrained>>;
  tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
  text: Awaited<ReturnType<typeof CLIPTextModelWithProjection.from_pretrained>>;
};

let loading: Promise<Loaded> | undefined;

function load(): Promise<Loaded> {
  loading ??= (async () => ({
    processor: await AutoProcessor.from_pretrained(EMBEDDING_MODEL),
    vision: await CLIPVisionModelWithProjection.from_pretrained(EMBEDDING_MODEL, { dtype: "fp32" }),
    tokenizer: await AutoTokenizer.from_pretrained(EMBEDDING_MODEL),
    text: await CLIPTextModelWithProjection.from_pretrained(EMBEDDING_MODEL, { dtype: "fp32" }),
  }))();
  return loading;
}

export async function embedImage(url: string): Promise<number[]> {
  const { processor, vision } = await load();
  const bytes = await fetchImage(url, 448);
  const image = await RawImage.fromBlob(new Blob([new Uint8Array(bytes)]));
  const inputs = await processor(image);
  const { image_embeds } = await vision(inputs);
  return normalize(Array.from(image_embeds.data as Float32Array));
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const { tokenizer, text } = await load();
  const inputs = tokenizer(texts, { padding: true, truncation: true });
  const { text_embeds } = await text(inputs);
  const dim = text_embeds.dims[1] as number;
  const flat = Array.from(text_embeds.data as Float32Array);
  return texts.map((_, i) => normalize(flat.slice(i * dim, (i + 1) * dim)));
}

function normalize(v: number[]): number[] {
  const n = Math.hypot(...v);
  if (!n) throw new Error("Zero-length embedding");
  return v.map((x) => x / n);
}

export const cosine = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);
