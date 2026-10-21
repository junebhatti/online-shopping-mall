import { SHOPPING_SOURCES, lastSaleFind, sourceStatus } from "@/lib/queries";
import { timeAgo } from "@/lib/format";

const SOURCE_LABEL: Record<string, string> = {
  shopify: "brand sites",
  yoox: "Yoox",
  grailed: "Grailed",
  ebay: "eBay",
  poshmark: "Poshmark",
  vinted: "Vinted",
  pinterest: "Pinterest",
  judge: "taste judge",
};

/** One-line status under the header: what's being watched and the latest markdown found. */
export async function SaleStrip() {
  const [status, find] = await Promise.all([sourceStatus(), lastSaleFind()]);
  // Only sources that bring in listings count as "watching for sales".
  const shopping = status.filter((s) => SHOPPING_SOURCES.has(s.source));
  // Each brand store counts once; a marketplace counts once however many searches it runs.
  const watching = shopping.reduce((n, s) => n + (s.source === "shopify" ? s.targets : 1), 0);
  const latest = shopping
    .filter((s) => s.lastFinishedAt)
    .sort((a, b) => b.lastFinishedAt!.getTime() - a.lastFinishedAt!.getTime())[0];
  const label = (s: { source: string }) => SOURCE_LABEL[s.source] ?? s.source;
  // Every target down reads as "not connected"; some down as "partly failing"; silence as "stale".
  const down = shopping.filter((s) => s.ok === 0 && s.failing.length > 0);
  const partial = shopping.filter((s) => s.ok > 0 && s.failing.length > 0);
  const stale = shopping.filter((s) => s.stale && !down.includes(s));
  const notes = [
    down.length ? `${down.map(label).join(", ")} not connected` : null,
    partial.length ? `${partial.map(label).join(", ")} partly failing` : null,
    stale.length ? `${stale.map(label).join(", ")} not checked lately` : null,
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-s3 overflow-hidden border-b border-divider px-s4 py-[7px] text-[11px] text-ink-muted md:px-s6">
      <span className="pulse h-1.5 w-1.5 flex-none rounded-full bg-accent" aria-hidden />
      <span className="tnum whitespace-nowrap">
        {watching
          ? `Watching ${watching} sources for sales${latest ? ` — checked ${SOURCE_LABEL[latest.source] ?? latest.source} ${timeAgo(latest.lastFinishedAt!)}` : ""}`
          : "Sale watch hasn't run yet"}
      </span>
      {notes.length ? <span className="whitespace-nowrap text-accent-ink">· {notes.join(" · ")}</span> : null}
      {find ? (
        <>
          <span className="text-ink-ghost">·</span>
          <span className="truncate italic">
            Last find: {find.brand} {find.name}, −{find.pct}% at {find.store}
          </span>
        </>
      ) : null}
    </div>
  );
}
