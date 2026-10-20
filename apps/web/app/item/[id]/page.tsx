import { sizedImageUrl } from "@mall/sources";
import { notFound } from "next/navigation";
import { OwnerControls } from "@/components/OwnerControls";
import { PriceChart } from "@/components/PriceChart";
import { SectionHead, TILE_GRID } from "@/components/SectionHead";
import { Tile } from "@/components/Tile";
import { isOwner } from "@/lib/auth";
import { usd } from "@/lib/format";
import { listingDetail } from "@/lib/queries";

const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [detail, owner] = await Promise.all([listingDetail(id), isOwner()]);
  if (!detail) notFound();
  const { tile: t, listing: l, history, similar, gap, elsewhere } = detail;
  const a = l.attributes;
  const m = a.measurements ?? {};
  const facts = [
    a.matchedSize ? ["Your size", a.matchedSize] : null,
    ["Condition", l.isUsed ? (l.condition ?? "used") : "new"],
    m.chestIn ? ["Chest", `${m.chestIn}"`] : null,
    m.lengthIn ? ["Length", `${m.lengthIn}"`] : null,
    m.waistIn ? ["Waist", `${m.waistIn}"`] : null,
    m.inseamIn ? ["Inseam", `${m.inseamIn}"`] : null,
    a.colors?.length ? ["Colors", a.colors.slice(0, 6).join(", ")] : null,
    a.shippingCents !== undefined ? ["Shipping", a.shippingCents ? usd(a.shippingCents) : "free"] : null,
    ["Sold by", l.store],
  ].filter((x): x is [string, string] => x !== null);

  return (
    <>
      <section className="grid gap-s8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-[72px]">
        <div className="flex flex-col gap-2">
          <div className="grid aspect-square place-items-center bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.image} alt={t.name} className="h-[88%] w-[88%] object-contain" style={{ mixBlendMode: t.hasCutout ? "normal" : ("var(--tile-blend)" as React.CSSProperties["mixBlendMode"]) }} />
          </div>
          {l.images.length > 1 ? (
            <div className="grid grid-cols-5 gap-2">
              {l.images.slice(1, 6).map((src) => (
                <div key={src} className="grid aspect-square place-items-center bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sizedImageUrl(src, 300)} alt="" loading="lazy" className="h-[90%] w-[90%] object-contain" style={{ mixBlendMode: "var(--tile-blend)" as React.CSSProperties["mixBlendMode"] }} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-s4">
          <div className="flex flex-col gap-s1">
            <span className="caps text-[10px] text-ink-muted">{t.brand}</span>
            <h1 className="m-0 font-heading text-[36px] font-normal leading-[1.05]">{t.name}</h1>
            <div className="tnum flex items-baseline gap-s2 text-[17px]">
              <span className={t.pct ? "text-accent-ink" : ""}>{usd(t.priceCents)}</span>
              {t.pct && t.retailCents ? (
                <>
                  <span className="text-[13px] text-ink-faint line-through">{usd(t.retailCents)}</span>
                  <span className="caps text-[10px] text-accent-ink">−{t.pct}%</span>
                </>
              ) : null}
            </div>
          </div>
          {gap ? (
            <p className="m-0 text-[12px] italic text-accent-ink">
              About {gap.pctUnder}% under new: {t.brand.replace(/^Vintage /, "")} {t.category.replace("_", " ")} usually {usd(gap.medianNewCents)} ({gap.samples} seen)
            </p>
          ) : null}
          {elsewhere.length ? (
            <div className="flex flex-col gap-1 text-[12px]">
              <span className="caps text-[10px] text-ink-muted">Also at</span>
              {elsewhere.map((e) => (
                <a key={e.id} href={`/item/${e.id}`} className="tnum flex justify-between border-b border-divider py-1 hover:text-accent-hover">
                  <span>{e.store}</span>
                  <span className={e.priceCents < t.priceCents ? "text-accent-ink" : ""}>{usd(e.priceCents)}</span>
                </a>
              ))}
            </div>
          ) : null}
          {t.status !== "active" ? (
            <p className="m-0 text-[13px] italic text-accent-ink">No longer available at {l.store}.</p>
          ) : null}
          <a href={l.url} target="_blank" rel="noreferrer" className="btn btn-primary self-start">
            Buy at {l.store} →
          </a>
          {owner ? <OwnerControls id={t.id} saved={t.saved} verdict={t.verdict} /> : null}
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-s6 border-t border-rule pt-s2 text-[13px]">
            {facts.map(([k, v]) => (
              <div key={k} className="col-span-2 grid grid-cols-subgrid border-b border-divider py-1.5">
                <dt className="caps text-[10px] leading-[1.9] text-ink-muted">{k}</dt>
                <dd className="m-0">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-s1">
            <span className="caps border-b border-rule pb-1.5 text-[10px]">Price history</span>
            {history.length >= 2 ? <PriceChart points={history} /> : null}
            <ul className="tnum m-0 list-none p-0 text-[12px]" aria-label="Every price seen">
              {history.map((p, i) => (
                <li key={i} className="flex justify-between border-b border-divider py-1">
                  <span className="text-ink-muted">{fmtDate(p.seenAt)}</span>
                  <span>{usd(p.priceCents)}</span>
                </li>
              ))}
            </ul>
            {history.length < 2 ? <p className="m-0 text-[11px] italic text-ink-muted">One price seen so far. Changes show here as the worker re-checks.</p> : null}
          </div>
          {owner && l.judgeNote ? <p className="m-0 text-[12px] italic text-ink-muted">Judge: {l.judgeNote}</p> : null}
          {a.description ? <p className="m-0 max-w-[62ch] text-[12px] leading-relaxed text-ink-soft">{a.description}</p> : null}
        </div>
      </section>
      {similar.length ? (
        <section className="flex flex-col gap-s3">
          <SectionHead label="Similar" note="closest by look, from everything that fits you" />
          <div className={TILE_GRID}>
            {similar.map((s) => (
              <Tile key={s.id} tile={s} owner={owner} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
