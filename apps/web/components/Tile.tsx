"use client";

import { Heart } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { rate, toggleSave } from "@/app/actions";
import { usd } from "@/lib/format";
import type { Tile as TileData } from "@/lib/tiles";

type Verdict = "wear" | "not" | "inspo";
type Props = { tile: TileData; owner: boolean; showPrice?: boolean; hideOnNot?: boolean; alwaysShowRate?: boolean };

const VERDICTS: { value: Verdict; label: string; title: string }[] = [
  { value: "wear", label: "Wear", title: "Would wear" },
  { value: "not", label: "Not", title: "Would not wear" },
  { value: "inspo", label: "Inspo", title: "Inspiration only: like the look, not a wear signal" },
];

export function Tile({ tile: t, owner, showPrice = true, hideOnNot = true, alwaysShowRate = false }: Props) {
  const [pending, start] = useTransition();
  const [verdict, setVerdict] = useOptimistic(t.verdict);
  const [saved, setSaved] = useOptimistic(t.saved);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<unknown>, optimistic: () => void) =>
    start(async () => {
      optimistic();
      setError(null);
      try {
        await fn();
      } catch (err) {
        console.error("tile action failed", err);
        setError("Didn't save. Try again.");
      }
    });

  if (hideOnNot && verdict === "not" && !pending) return null;

  const labels = [
    t.pct ? { text: `−${t.pct}%`, accent: true } : null,
    t.isUsed ? { text: `Used · ${t.store}`, accent: false } : null,
    t.isNew ? { text: t.pct ? "Just found" : "Just in", accent: false } : null,
    t.status !== "active" ? { text: t.status === "sold" ? "Sold" : "Gone", accent: false } : null,
  ].filter((x): x is { text: string; accent: boolean } => x !== null);

  return (
    <article className={`group fade-in flex min-w-0 flex-col gap-1.5 ${verdict === "not" ? "opacity-40" : ""}`}>
      <div className="relative aspect-square overflow-hidden bg-surface">
        <Link href={`/item/${t.id}`} className="grid h-full w-full place-items-center" aria-label={`${t.brand} ${t.name}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- cutouts are served by our own route */}
          <img
            src={t.image}
            alt=""
            loading="lazy"
            className="h-[86%] w-[86%] object-contain transition-transform duration-300 group-hover:scale-[1.02]"
            style={{ mixBlendMode: t.hasCutout ? "normal" : ("var(--tile-blend)" as React.CSSProperties["mixBlendMode"]) }}
          />
        </Link>
        {labels.length ? (
          <div className="tnum caps pointer-events-none absolute left-2 top-[7px] flex flex-col gap-0.5 text-[9px] tracking-[0.08em]">
            {labels.map((l) => (
              <span key={l.text} className={l.accent ? "text-accent-ink" : "text-ink-muted"}>
                {l.text}
              </span>
            ))}
          </div>
        ) : null}
        {owner ? (
          <button
            type="button"
            aria-label={saved ? "Unsave" : "Save and watch for price drops"}
            aria-pressed={saved}
            onClick={() => run(() => toggleSave(t.id), () => setSaved(!saved))}
            className={`absolute right-0.5 top-0.5 grid h-[30px] w-[30px] cursor-pointer place-items-center transition-colors hover:text-accent ${saved ? "text-accent" : "text-ink-faint"}`}
          >
            <Heart size={14} strokeWidth={1.5} fill={saved ? "currentColor" : "none"} />
          </button>
        ) : null}
      </div>
      <div className="flex flex-col gap-px text-[11px] leading-[1.35]">
        <span className="caps truncate text-[9px] text-ink-muted">{t.brand}</span>
        <Link href={`/item/${t.id}`} className="truncate hover:text-accent-hover">
          {t.name}
        </Link>
        {showPrice ? (
          <div className="tnum flex gap-1.5">
            <span className={t.pct ? "text-accent-ink" : ""}>{usd(t.priceCents)}</span>
            {t.pct && t.retailCents ? <span className="text-ink-faint line-through">{usd(t.retailCents)}</span> : null}
            <span className="ml-auto truncate text-ink-faint">{t.pct ? t.store : (t.meta ?? t.store)}</span>
          </div>
        ) : null}
      </div>
      {owner ? (
        <div
          role="group"
          aria-label="Rate"
          className={`caps flex gap-px text-[9px] transition-opacity ${alwaysShowRate || verdict ? "" : "md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100"}`}
        >
          {VERDICTS.map((v) => (
            <button
              key={v.value}
              type="button"
              title={v.title}
              aria-pressed={verdict === v.value}
              onClick={() => {
                const next = verdict === v.value ? null : v.value;
                run(() => rate(t.id, next), () => setVerdict(next));
              }}
              className={`flex-1 cursor-pointer border py-1 transition-colors ${
                verdict === v.value
                  ? "border-accent text-accent-ink"
                  : "border-divider text-ink-muted hover:border-accent hover:text-accent-hover"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <span className="text-[10px] italic text-accent-ink">{error}</span> : null}
    </article>
  );
}
