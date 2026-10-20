import { SectionHead, TILE_GRID } from "@/components/SectionHead";
import { Tile } from "@/components/Tile";
import { isOwner } from "@/lib/auth";
import { inspiration } from "@/lib/queries";

export default async function InspirationPage() {
  const [cards, owner] = await Promise.all([inspiration(), isOwner()]);
  const pins = cards.filter((c) => c.kind === "pin").length;
  return (
    <section className="flex flex-col gap-s3">
      <SectionHead
        label="Inspiration"
        count={`${pins} pins · ${cards.length - pins} pieces`}
        note="from your Pinterest boards and everything you marked inspo"
      />
      <div className={TILE_GRID}>
        {cards.map((c) =>
          c.kind === "pin" ? (
            <a key={c.id} href={c.href} target="_blank" rel="noreferrer" className="group fade-in flex min-w-0 flex-col gap-1.5">
              <div className="aspect-square overflow-hidden bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.image} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
              </div>
              <span className="caps truncate text-[9px] text-ink-muted">{c.board}</span>
            </a>
          ) : (
            <Tile key={`l${c.tile.id}`} tile={c.tile} owner={owner} showPrice={false} hideOnNot={false} />
          ),
        )}
      </div>
    </section>
  );
}
