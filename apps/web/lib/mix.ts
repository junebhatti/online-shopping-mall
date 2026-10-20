/**
 * Brand mix from the v4 handoff: greedily place the next item whose brand isn't one
 * of the last two placed, so no label runs more than twice in a row. Keeps the input
 * order otherwise; falls back to the next item when every remaining one would repeat.
 */
export function brandMix<T>(items: T[], brandOf: (item: T) => string): T[] {
  const rest = [...items];
  const out: T[] = [];
  while (rest.length) {
    const recent = out.slice(-2).map(brandOf);
    const i = rest.findIndex((it) => !recent.includes(brandOf(it)));
    out.push(...rest.splice(i === -1 ? 0 : i, 1));
  }
  return out;
}
