import { JustListed, SaleSection } from "@/components/FeedSections";
import { isOwner } from "@/lib/auth";
import { feed } from "@/lib/queries";

export default async function FeedPage() {
  const [{ sale, justListed }, owner] = await Promise.all([feed(), isOwner()]);
  if (sale.length + justListed.length === 0) {
    return (
      <p className="font-heading text-[22px] italic text-ink-muted">
        Nothing admitted yet. The worker fills the feed after its first cycle.
      </p>
    );
  }
  return (
    <>
      <SaleSection items={sale} owner={owner} />
      <JustListed items={justListed} owner={owner} />
    </>
  );
}
