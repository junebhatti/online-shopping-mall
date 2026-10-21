import { loadBrands, loadPinterest, loadRules, loadTaste } from "@mall/config";
import Link from "next/link";
import { logout } from "@/app/actions";
import { isOwner, ownerLoginConfigured } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { countsByStore, ratedCount, sourceStatus } from "@/lib/queries";
import { brandSuggestions } from "@/lib/suggest";

const GROUPS = [
  { key: "clothing", label: "Clothing", note: "new stock" },
  { key: "vintage", label: "Vintage", note: "Depop, eBay and resale only" },
  { key: "fragrance", label: "Fragrance", note: "" },
  { key: "essentials", label: "Essentials", note: "" },
] as const;

const SOURCE_NAMES: Record<string, string> = {
  shopify: "Brand sites",
  yoox: "Yoox (sale)",
  grailed: "Grailed",
  ebay: "eBay",
  pinterest: "Pinterest boards",
  judge: "Taste judge (Claude)",
  digest: "Daily digest email",
};

export default async function SettingsPage() {
  const brands = loadBrands();
  const rules = loadRules();
  const taste = loadTaste();
  const boards = loadPinterest().boards;
  const [counts, status, rated, owner, suggestions] = await Promise.all([
    countsByStore(),
    sourceStatus(),
    ratedCount(),
    isOwner(),
    brandSuggestions(),
  ]);

  const grouped = GROUPS.map((g) => ({
    ...g,
    brands: brands.filter((b) =>
      g.key === "vintage" ? b.kind === "vintage" : g.key === "clothing" ? b.department === "clothing" && b.kind === "new" : b.department === g.key,
    ),
  }));

  return (
    <section className="grid max-w-[1200px] gap-x-[72px] gap-y-s8 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-s6">
        <div className="flex flex-col gap-s2">
          <h1 className="m-0 font-heading text-[44px] font-normal leading-none">Settings</h1>
          <p className="m-0 max-w-[60ch] text-justify text-[13px] text-ink-soft">
            The feed always mixes every brand below, so no single label takes over. Tap a name to look at just that brand for a
            moment. Brands, sizes and rules live in the repo&apos;s config folder.
          </p>
        </div>
        {grouped.map((g) => (
          <div key={g.key} className="flex flex-col">
            <div className="flex items-baseline gap-2.5 border-b border-rule pb-1.5">
              <span className="caps text-[10px]">{g.label}</span>
              {g.note ? <span className="text-[11px] italic text-ink-muted">{g.note}</span> : null}
            </div>
            {g.brands.map((b) => {
              const n = counts.get(b.name) ?? 0;
              const how = b.feed === "shopify" ? "from the brand site" : b.kind === "vintage" ? "resale" : "via Yoox, Grailed and eBay";
              return (
                <Link
                  key={b.name}
                  href={`/?brand=${encodeURIComponent(b.name)}`}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_60px] items-baseline gap-s4 border-b border-divider py-[9px] transition-colors hover:text-accent-hover"
                >
                  <span className="font-heading text-[19px]">{b.name}</span>
                  <span className="text-[12px] italic text-ink-muted">
                    {[b.note, how, b.sale_only ? "sale only" : null].filter(Boolean).join(" · ")}
                  </span>
                  <span className="tnum text-right text-[11px] text-ink-muted">{n || "—"}</span>
                </Link>
              );
            })}
          </div>
        ))}
        {suggestions.length ? (
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2.5 border-b border-rule pb-1.5">
              <span className="caps text-[10px]">Brands you might add</span>
              <span className="text-[11px] italic text-ink-muted">keep showing up in what you rate and what the judge likes</span>
            </div>
            {suggestions.map((b) => (
              <Link
                key={b.brand}
                href={`/?brand=${encodeURIComponent(b.brand)}`}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_60px] items-baseline gap-s4 border-b border-divider py-[9px] transition-colors hover:text-accent-hover"
              >
                <span className="font-heading text-[19px]">{b.brand}</span>
                <span className="text-[12px] italic text-ink-muted">
                  {[b.wear ? `${b.wear} would wear` : null, b.saved ? `${b.saved} saved` : null, b.strongFits ? `${b.strongFits} strong judge fits` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className="tnum text-right text-[11px] text-ink-muted">{b.score}</span>
              </Link>
            ))}
            <p className="m-0 pt-1.5 text-[11px] italic text-ink-muted">Add one by putting it in config/brands.yaml.</p>
          </div>
        ) : null}
      </div>

      <aside className="flex flex-col gap-s6 pt-3">
        <Block title="Sources">
          {status.length === 0 ? <Row name="No runs yet" note="start the worker" /> : null}
          {status.map((s) => (
            <div key={s.source} className="flex flex-col border-b border-divider py-1">
              <div className="flex justify-between text-[13px]">
                <span>{SOURCE_NAMES[s.source] ?? s.source}</span>
                <span className={`text-[11px] italic ${s.failing.length ? "text-accent-ink" : "text-ink-muted"}`}>
                  {s.failing.length ? `${s.failing.length} of ${s.targets} failing` : `ok${s.lastFinishedAt ? `, ${timeAgo(s.lastFinishedAt)}` : ""}`}
                </span>
              </div>
              {s.failing.slice(0, 2).map((f) => (
                <span key={`${f.target}`} className="text-[11px] leading-snug text-ink-muted">
                  {f.target ? `${f.target}: ` : ""}
                  {f.error.slice(0, 140)}
                </span>
              ))}
            </div>
          ))}
          <p className="m-0 text-[11px] italic text-ink-muted">Resale every 2 hours, brand sites and Yoox twice a day, Pinterest daily.</p>
        </Block>
        <Block title="Sizes">
          <div className="flex flex-wrap gap-1.5">
            <span className="tag tag-neutral">Tops {rules.sizes.tops[0]}</span>
            <span className="tag tag-neutral">Waist {rules.sizes.waist}</span>
            <span className="tag tag-neutral">
              Inseam {rules.sizes.inseam.min}–{rules.sizes.inseam.max}
            </span>
            <span className="tag tag-neutral">Shoe {rules.sizes.shoe}</span>
            <span className="tag tag-neutral">
              Chest {rules.sizes.top_measurements.chest_in.join("–")}&quot;
            </span>
            <span className="tag tag-neutral">
              Length {rules.sizes.top_measurements.length_in.join("–")}&quot;
            </span>
          </div>
        </Block>
        <Block title="Taste">
          <Row name="Admitted per day" note={String(rules.admission.daily_limit)} />
          <Row name="Ratings so far" note={String(rated)} />
          <Row name="Pinterest boards used" note={Object.values(boards).filter((u) => u === "clothing").length + " of " + Object.keys(boards).length} />
          <Row name="Judge model" note={taste.judge.model} />
        </Block>
        {owner ? (
          <Block title="Digest">
            <Link href="/digest" className="btn btn-ghost self-start text-[12px]">Preview today&apos;s email →</Link>
          </Block>
        ) : null}
        <Block title="Owner">
          {owner ? (
            <form action={logout}>
              <button type="submit" className="btn btn-ghost text-[12px]">Log out</button>
            </form>
          ) : ownerLoginConfigured() ? (
            <Link href="/login?next=/settings" className="btn btn-ghost self-start text-[12px]">Log in</Link>
          ) : (
            <p className="m-0 text-[12px] italic text-ink-muted">Set OWNER_PASSWORD in .env.local to enable owner login.</p>
          )}
        </Block>
      </aside>
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-s2">
      <span className="caps border-b border-rule pb-1.5 text-[10px]">{title}</span>
      {children}
    </div>
  );
}

function Row({ name, note }: { name: string; note: string }) {
  return (
    <div className="flex justify-between border-b border-divider py-1 text-[13px]">
      <span>{name}</span>
      <span className="text-[11px] italic text-ink-muted">{note}</span>
    </div>
  );
}
