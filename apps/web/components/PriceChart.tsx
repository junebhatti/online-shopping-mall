"use client";

import { useEffect, useRef, useState } from "react";
import { usd } from "@/lib/format";

type Point = { priceCents: number; seenAt: Date };

const H = 140;
const PAD = { top: 16, right: 64, bottom: 22, left: 40 };
// #b68235 passes the dataviz lightness/contrast checks on both grounds (light #f3f2f2, dark #1a1918).
const LINE = "#b68235";

const fmtDay = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Step line of observed prices, extended to now. Hover shows the price in effect at that moment. */
export function PriceChart({ points }: { points: Point[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(480);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const now = Date.now();
  const t0 = points[0]!.seenAt.getTime();
  const span = Math.max(now - t0, 3_600_000);
  const prices = points.map((p) => p.priceCents);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const step = niceStep((hi - lo) / 2 || hi * 0.1 || 100);
  const yMin = Math.max(0, Math.floor(lo / step) * step - step);
  const yMax = Math.ceil(hi / step) * step + step;
  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + ((t - t0) / span) * innerW;
  const y = (c: number) => PAD.top + (1 - (c - yMin) / (yMax - yMin)) * innerH;

  let d = `M${x(t0)},${y(points[0]!.priceCents)}`;
  for (const p of points.slice(1)) d += ` H${x(p.seenAt.getTime())} V${y(p.priceCents)}`;
  d += ` H${x(now)}`;

  const ticks = [yMin, (yMin + yMax) / 2, yMax];
  const last = points[points.length - 1]!;
  const active = hover === null ? null : points[hover]!;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const t = t0 + ((e.clientX - box.left) / box.width) * span;
    let i = 0;
    while (i + 1 < points.length && points[i + 1]!.seenAt.getTime() <= t) i++;
    setHover(i);
  };

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={H} role="img" aria-label={`Price history, now ${usd(last.priceCents)}`} className="block overflow-visible">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={PAD.left + innerW} y1={y(v)} y2={y(v)} stroke="var(--divider)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="tnum fill-ink-muted text-[10px]">
              {usd(Math.round(v / 100) * 100)}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={H - 4} className="fill-ink-muted text-[10px]">{fmtDay(points[0]!.seenAt)}</text>
        <text x={PAD.left + innerW} y={H - 4} textAnchor="end" className="fill-ink-muted text-[10px]">today</text>
        <path d={d} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(p.seenAt.getTime())} cy={y(p.priceCents)} r={4} fill={LINE} stroke="var(--ground)" strokeWidth={2} />
        ))}
        <text x={x(now) + 6} y={y(last.priceCents)} dy="0.32em" className="tnum fill-ink text-[11px]">
          {usd(last.priceCents)}
        </text>
        {active ? (
          <line x1={x(active.seenAt.getTime())} x2={x(active.seenAt.getTime())} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--ink-faint)" strokeWidth={1} />
        ) : null}
        <rect
          x={PAD.left}
          y={0}
          width={innerW}
          height={H}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {active ? (
        <div
          className="tnum pointer-events-none absolute top-0 rounded-[4px] border border-divider bg-ground px-2 py-1 text-[11px] shadow-[var(--shadow-md)]"
          style={{ left: Math.min(x(active.seenAt.getTime()) + 8, width - 120) }}
        >
          <div className="text-ink-muted">{fmtDay(active.seenAt)}</div>
          <div>{usd(active.priceCents)}</div>
        </div>
      ) : null}
    </div>
  );
}

function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}
