import { BROWSER_UA } from "@mall/sources";

/** Ask image CDNs for a smaller rendition where they support it; full-size product shots are 2-5 MB. */
export function sizedImageUrl(url: string, width: number): string {
  const u = new URL(url);
  if (u.hostname.endsWith("cdn.shopify.com") || u.pathname.includes("/cdn/shop/")) {
    u.searchParams.set("width", String(width));
    return u.toString();
  }
  if (u.hostname.endsWith("ebayimg.com")) return url.replace(/s-l\d+\./, width <= 500 ? "s-l500." : "s-l1600.");
  return url;
}

export async function fetchImage(url: string, width = 512): Promise<Buffer> {
  const res = await fetch(sizedImageUrl(url, width), {
    headers: { "user-agent": BROWSER_UA, accept: "image/avif,image/webp,image/jpeg,image/*" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Image ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}
