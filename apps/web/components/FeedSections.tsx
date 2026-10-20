"use client";

import { useState } from "react";
import type { Tile as TileData } from "@/lib/tiles";
import { PRICE_MAX, PriceRange } from "./PriceRange";
import { SectionHead, TILE_GRID } from "./SectionHead";
import { Tile } from "./Tile";

const SALE_PREVIEW = 12;

export function SaleSection({ items, owner }: { items: TileData[]; owner: boolean }) {
  const [all, setAll] = useState(false);
  if (items.length === 0) return null;
  const shown = all ? items : items.slice(0, SALE_PREVIEW);
  return (
    <section className="flex flex-col gap-s3">
      <SectionHead label="On sale now" count={`${items.length} found`} note="newest finds first, then biggest markdown" sale />
      <div className={TILE_GRID}>
        {shown.map((t) => (
          <Tile key={t.id} tile={t} owner={owner} />
        ))}
      </div>
      {items.length > SALE_PREVIEW ? (
        <button type="button" className="btn btn-ghost self-start text-[12px]" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${items.length} markdowns`}
        </button>
      ) : null}
    </section>
  );
}

export function JustListed({ items, owner, label = "Just listed" }: { items: TileData[]; owner: boolean; label?: string }) {
  const [range, setRange] = useState({ min: 0, max: PRICE_MAX });
  const visible = items.filter((t) => t.priceCents >= range.min && (range.max >= PRICE_MAX || t.priceCents <= range.max));
  return (
    <section className="flex flex-col gap-s3">
      <SectionHead label={label} count={String(visible.length)}>
        <PriceRange min={range.min} max={range.max} onChange={(min, max) => setRange({ min, max })} />
      </SectionHead>
      {visible.length ? (
        <div className={TILE_GRID}>
          {visible.map((t) => (
            <Tile key={t.id} tile={t} owner={owner} />
          ))}
        </div>
      ) : (
        <p className="font-heading text-[22px] italic text-ink-muted">Nothing in that price range.</p>
      )}
    </section>
  );
}
