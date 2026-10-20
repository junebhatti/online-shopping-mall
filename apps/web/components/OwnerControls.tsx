"use client";

import { Heart } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { rate, toggleSave } from "@/app/actions";

type Verdict = "wear" | "not" | "inspo";

/** Save + rate controls for the item page (the tile has its own compact version). */
export function OwnerControls({ id, saved: savedInit, verdict: verdictInit }: { id: number; saved: boolean; verdict: Verdict | null }) {
  const [, start] = useTransition();
  const [saved, setSaved] = useOptimistic(savedInit);
  const [verdict, setVerdict] = useOptimistic(verdictInit);
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>, optimistic: () => void) =>
    start(async () => {
      optimistic();
      setError(null);
      try {
        await fn();
      } catch (err) {
        console.error("owner action failed", err);
        setError("Didn't save. Try again.");
      }
    });

  return (
    <div className="flex flex-col gap-s2">
      <div className="flex flex-wrap items-center gap-s2">
        <button
          type="button"
          aria-pressed={saved}
          onClick={() => run(() => toggleSave(id), () => setSaved(!saved))}
          className={`btn ${saved ? "btn-primary" : "border-divider"} border`}
        >
          <Heart size={14} strokeWidth={1.5} fill={saved ? "currentColor" : "none"} />
          {saved ? "Saved, watching price" : "Save and watch price"}
        </button>
        {(["wear", "not", "inspo"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={verdict === v}
            onClick={() => run(() => rate(id, verdict === v ? null : v), () => setVerdict(verdict === v ? null : v))}
            className={`btn border ${verdict === v ? "btn-primary" : "border-divider"}`}
          >
            {v === "wear" ? "Would wear" : v === "not" ? "Would not wear" : "Inspo"}
          </button>
        ))}
      </div>
      {error ? <p className="m-0 text-[12px] italic text-accent-ink">{error}</p> : null}
    </div>
  );
}
