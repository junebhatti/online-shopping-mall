import Link from "next/link";
import { JustListed, SaleSection } from "@/components/FeedSections";
import { isOwner } from "@/lib/auth";
import { brandView, feed } from "@/lib/queries";

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ brand?: string }> }) {
  const brand = (await searchParams).brand?.slice(0, 80).trim() || null;
  const [{ sale, justListed }, owner] = await Promise.all([brand ? brandView(brand) : feed(), isOwner()]);
  return (
    <>
      {brand ? (
        <Link href="/" className="tag tag-outline self-start" aria-label={`Clear the ${brand} filter`}>
          Only {brand} ×
        </Link>
      ) : null}
      {sale.length + justListed.length === 0 ? (
        <p className="font-heading text-[22px] italic text-ink-muted">
          {brand ? `Nothing from ${brand} fits right now.` : "Nothing admitted yet. The worker fills the feed after its first cycle."}
        </p>
      ) : (
        <>
          <SaleSection items={sale} owner={owner} />
          <JustListed items={justListed} owner={owner} label={brand ? "Everything that fits" : "Just listed"} />
        </>
      )}
    </>
  );
}
