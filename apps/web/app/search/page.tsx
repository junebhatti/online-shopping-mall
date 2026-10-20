import { JustListed, SaleSection } from "@/components/FeedSections";
import { isOwner } from "@/lib/auth";
import { search } from "@/lib/queries";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").slice(0, 200).trim();
  const [{ sale, results }, owner] = await Promise.all([q ? search(q) : { sale: [], results: [] }, isOwner()]);
  const total = sale.length + results.length;
  return (
    <>
      <section className="flex flex-wrap items-baseline gap-x-s4 gap-y-s1">
        <h1 className="m-0 font-heading text-[40px] font-normal leading-[1.05]">“{q}”</h1>
        <span className="tnum text-[12px] text-ink-muted">
          {total} {total === 1 ? "piece" : "pieces"} that fit your sizes and rules
        </span>
      </section>
      <SaleSection items={sale} owner={owner} />
      {results.length || !sale.length ? <JustListed items={results} owner={owner} label="Results" /> : null}
    </>
  );
}
