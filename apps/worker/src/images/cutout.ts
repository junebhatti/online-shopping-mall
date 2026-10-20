import { RawImage, pipeline, type BackgroundRemovalPipeline } from "@huggingface/transformers";
import sharp from "sharp";
import "../taste/embed.ts"; // sets the shared model cache directory
import { fetchImage } from "./fetch.ts";

/** Salient-object matting; keeps the garment (and a model wearing it) and drops the studio backdrop. */
export const CUTOUT_MODEL = "onnx-community/BiRefNet_lite"; // MIT licence

let remover: Promise<BackgroundRemovalPipeline> | undefined;

const load = () => (remover ??= pipeline("background-removal", CUTOUT_MODEL, { dtype: "fp32" }) as Promise<BackgroundRemovalPipeline>);

export type Cutout = { webp: Buffer; width: number; height: number };

export async function makeCutout(url: string): Promise<Cutout> {
  const bytes = await fetchImage(url, 1000);
  const input = await RawImage.fromBlob(new Blob([new Uint8Array(bytes)]));
  const result: RawImage | RawImage[] = await (await load())(input);
  const out = Array.isArray(result) ? result[0] : result;
  if (!out) throw new Error("background removal returned no image");
  const rgba = out.channels === 4 ? out : out.rgba();
  const { data, info } = await sharp(Buffer.from(rgba.data), {
    raw: { width: rgba.width, height: rgba.height, channels: 4 },
  })
    .trim({ threshold: 10 })
    .resize(800, 800, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, alphaQuality: 90 })
    .toBuffer({ resolveWithObject: true });
  return { webp: data, width: info.width, height: info.height };
}
