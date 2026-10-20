import { BROWSER_UA, sizedImageUrl } from "@mall/sources";

export async function fetchImage(url: string, width = 512): Promise<Buffer> {
  const res = await fetch(sizedImageUrl(url, width), {
    headers: { "user-agent": BROWSER_UA, accept: "image/avif,image/webp,image/jpeg,image/*" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Image ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}
