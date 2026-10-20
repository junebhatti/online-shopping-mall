export const usd = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export const pctOff = (price: number, retail: number | null) =>
  retail && retail > price ? Math.round((1 - price / retail) * 100) : null;

/** LA Apparel prefixes titles with style codes ("1210GD - ..."); the feed shows the name only. */
export const displayName = (title: string) =>
  title.replace(/^[A-Z0-9][A-Z0-9.-]{2,}(?:\s+(?:Unisex|Mix))?\s+-\s+/, "").trim();

export function timeAgo(date: Date): string {
  const mins = Math.round((Date.now() - date.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
