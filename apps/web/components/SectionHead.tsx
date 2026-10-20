import type { ReactNode } from "react";

type Props = { label: string; count?: string; note?: string; sale?: boolean; children?: ReactNode };

/** Section header row from v4: caps label, count, italic note, optional right-side control. */
export function SectionHead({ label, count, note, sale, children }: Props) {
  return (
    <div
      className={`flex flex-wrap items-baseline gap-x-s3 gap-y-s1 border-b pb-2 ${sale ? "border-accent-line" : "border-divider"}`}
    >
      <h2 className={`caps m-0 font-body text-[11px] font-normal ${sale ? "text-accent-ink" : ""}`}>{label}</h2>
      {count ? <span className="tnum text-[11px] text-ink-muted">{count}</span> : null}
      {note ? <span className="ml-auto text-[11px] italic text-ink-muted max-sm:hidden">{note}</span> : null}
      {children ? <div className={note ? "" : "ml-auto"}>{children}</div> : null}
    </div>
  );
}

export const TILE_GRID = "grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-2 gap-y-s4";
