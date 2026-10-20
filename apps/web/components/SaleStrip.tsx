import { lastSaleFind, sourceStatus } from "@/lib/queries";
import { timeAgo } from "@/lib/format";

const SOURCE_LABEL: Record<string, string> = { shopify: "brand sites", ebay: "eBay", pinterest: "Pinterest", judge: "taste judge" };

/** One-line status under the header: what's being watched and the latest markdown found. */
export async function SaleStrip() {
  const [status, find] = await Promise.all([sourceStatus(), lastSaleFind()]);
  // Only sources that bring in listings count as "watching for sales".
  const NOT_SHOPPING = new Set(["pinterest", "judge", "digest"]);
  const shopping = status.filter((s) => !NOT_SHOPPING.has(s.source));
  const watching = shopping.reduce((n, s) => n + s.targets, 0);
  const latest = shopping
    .filter((s) => s.lastFinishedAt)
    .sort((a, b) => b.lastFinishedAt!.getTime() - a.lastFinishedAt!.getTime())[0];
  const failing = shopping.filter((s) => s.ok === 0);

  return (
    <div className="flex items-center gap-s3 overflow-hidden border-b border-divider px-s4 py-[7px] text-[11px] text-ink-muted md:px-s6">
      <span className="pulse h-1.5 w-1.5 flex-none rounded-full bg-accent" aria-hidden />
      <span className="tnum whitespace-nowrap">
        {watching
          ? `Watching ${watching} sources for sales${latest ? ` — checked ${SOURCE_LABEL[latest.source] ?? latest.source} ${timeAgo(latest.lastFinishedAt!)}` : ""}`
          : "Sale watch hasn't run yet"}
      </span>
      {failing.length ? (
        <span className="whitespace-nowrap text-accent-ink">
          · {failing.map((s) => SOURCE_LABEL[s.source] ?? s.source).join(", ")} not connected
        </span>
      ) : null}
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
