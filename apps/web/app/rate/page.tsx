import { loadRules } from "@mall/config";
import Link from "next/link";
import { SectionHead, TILE_GRID } from "@/components/SectionHead";
import { Tile } from "@/components/Tile";
import { isOwner } from "@/lib/auth";
import { ratedCount, ratingQueue } from "@/lib/queries";

export default async function RatePage() {
  if (!(await isOwner())) {
    return (
      <p className="font-heading text-[22px] italic text-ink-muted">
        Rating is for the owner. <Link href="/login?next=/rate" className="text-accent underline">Log in</Link>
      </p>
    );
  }
  const size = loadRules().admission.rating_session_size;
  const [queue, rated] = await Promise.all([ratingQueue(size), ratedCount()]);
  return (
    <section className="flex flex-col gap-s4">
      <div className="flex flex-col gap-s2">
        <h1 className="m-0 font-heading text-[40px] font-normal leading-none">Rate</h1>
        <p className="m-0 max-w-[62ch] text-[13px] text-ink-soft">
          Wear, Not, or Inspo on each piece, even ones you wouldn&apos;t buy. Most of these are the scorer&apos;s best guesses;
          some are random so it learns what you don&apos;t like too. Ratings reshape the feed on the worker&apos;s next cycle.
        </p>
      </div>
      <SectionHead label="Today's session" count={`${queue.length} to rate`} note={`${rated} rated so far`} />
      {queue.length ? (
        <div className={TILE_GRID}>
          {queue.map((t) => (
            <Tile key={t.id} tile={t} owner hideOnNot={false} alwaysShowRate />
          ))}
        </div>
      ) : (
        <p className="font-heading text-[22px] italic text-ink-muted">All caught up. New candidates arrive with the next cycle.</p>
      )}
    </section>
  );
}
