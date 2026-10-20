import { SectionHead, TILE_GRID } from "@/components/SectionHead";
import { Tile } from "@/components/Tile";
import { isOwner } from "@/lib/auth";
import { savedTiles } from "@/lib/queries";

export default async function SavedPage() {
  const [tiles, owner] = await Promise.all([savedTiles(), isOwner()]);
  return (
    <section className="flex flex-col gap-s3">
      <SectionHead label="Saved" count={String(tiles.length)} note="watched for price drops" />
      {tiles.length ? (
        <div className={TILE_GRID}>
          {tiles.map((t) => (
            <Tile key={t.id} tile={t} owner={owner} hideOnNot={false} />
          ))}
        </div>
      ) : (
        <p className="font-heading text-[22px] italic text-ink-muted">Nothing saved yet.</p>
      )}
    </section>
  );
}
