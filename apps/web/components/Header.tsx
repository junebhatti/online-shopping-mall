"use client";

import { Search, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

type Props = { savedCount: number; owner: boolean };

export function Header({ savedCount, owner }: Props) {
  const path = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(path === "/search" ? (params.get("q") ?? "") : "");

  const views = [
    { href: "/", label: "Feed" },
    { href: "/inspiration", label: "Inspiration" },
    { href: "/saved", label: "Saved", count: savedCount },
    ...(owner ? [{ href: "/rate", label: "Rate" }] : []),
  ];

  return (
    <header className="sticky top-0 z-10 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-s4 gap-y-s2 border-b border-divider bg-ground px-s4 py-s3 max-md:grid-cols-[minmax(0,1fr)_auto] md:gap-x-s8 md:px-s6">
      <nav className="flex gap-s4">
        {views.map((v) => {
          const active = v.href === "/" ? path === "/" : path.startsWith(v.href);
          return (
            <Link
              key={v.href}
              href={v.href}
              aria-current={active ? "page" : undefined}
              className={`caps border-b py-1 text-[12px] tracking-[0.08em] transition-colors hover:text-accent-hover ${
                active ? "border-accent text-accent-ink" : "border-transparent"
              }`}
            >
              {v.label}
              {v.count ? <sup className="tnum ml-0.5 text-[9px] text-ink-faint">{v.count}</sup> : null}
            </Link>
          );
        })}
      </nav>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const q = query.trim();
          if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
        }}
        className="flex min-w-0 items-center gap-s2 border-b border-divider pl-0.5 max-md:col-span-2 max-md:row-start-2"
      >
        <Search size={15} strokeWidth={1.5} className="flex-none text-ink-faint" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search every source"
          placeholder="Search every source — “vintage Brooks Brothers oxford”, “wool trousers under $150”"
          className="min-w-0 flex-1 bg-transparent py-2 font-body text-[13px] text-ink outline-none placeholder:text-ink-ghost"
        />
        {query ? (
          <button
            type="button"
            className="btn btn-ghost text-[12px]"
            onClick={() => {
              setQuery("");
              if (path === "/search") router.push("/");
            }}
          >
            Clear
          </button>
        ) : null}
      </form>
      <Link
        href="/settings"
        aria-label="Settings"
        className={`btn btn-icon max-md:col-start-2 max-md:row-start-1 ${path.startsWith("/settings") ? "text-accent-ink" : "text-ink"}`}
      >
        <Settings size={17} strokeWidth={1.5} />
      </Link>
    </header>
  );
}
