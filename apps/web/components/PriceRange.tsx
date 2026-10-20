"use client";

import { usd } from "@/lib/format";

export const PRICE_MAX = 50_000; // $500+, in cents
const STEP = 500;
const MIN_GAP = 1_000;

type Props = { min: number; max: number; onChange: (min: number, max: number) => void };

/** Dual-thumb slider from v4: $0 to $500+, step $5, thumbs at least $10 apart. */
export function PriceRange({ min, max, onChange }: Props) {
  const left = (min / PRICE_MAX) * 100;
  const right = 100 - (max / PRICE_MAX) * 100;
  return (
    <div className="tnum flex items-center gap-2.5 text-[11px] text-ink-muted">
      <span>{usd(min)}</span>
      <div className="relative h-[13px] w-[150px]">
        <div className="absolute inset-x-0 top-1/2 h-px bg-[var(--track)]" />
        <div className="absolute top-1/2 h-px bg-accent" style={{ left: `${left}%`, right: `${right}%` }} />
        <input
          type="range"
          className="dual"
          aria-label="Minimum price"
          min={0}
          max={PRICE_MAX}
          step={STEP}
          value={min}
          onChange={(e) => onChange(Math.min(Number(e.target.value), max - MIN_GAP), max)}
        />
        <input
          type="range"
          className="dual"
          aria-label="Maximum price"
          min={0}
          max={PRICE_MAX}
          step={STEP}
          value={max}
          onChange={(e) => onChange(min, Math.max(Number(e.target.value), min + MIN_GAP))}
        />
      </div>
      <span>{max >= PRICE_MAX ? "$500+" : usd(max)}</span>
    </div>
  );
}
