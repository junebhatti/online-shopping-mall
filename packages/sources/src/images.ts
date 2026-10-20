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
