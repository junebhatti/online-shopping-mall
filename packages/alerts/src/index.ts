import { cutouts, db, listings, orm, pricePoints, saves, watches } from "@mall/db";

// Sale alerts: the only email the mall sends (Junaid, 2026-10-21: no daily digest).
// A saved piece qualifies when it drops min_drop_pct below its price when saved; a watch when its
// cheapest match is marked down that much or comes in under the watch's target price.

export type SaleAlert = {
  kind: "saved" | "watch";
  saveId?: number;
  watchId?: number;
  watchLabel?: string;
  listingId: number;
  brand: string;
  name: string;
  store: string;
  priceCents: number;
  wasCents: number;
  pct: number;
  image: string | null;
  url: string;
};

const usd = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const cleanTitle = (title: string) => title.replace(/^[A-Z0-9][A-Z0-9.-]{2,}(?:\s+(?:Unisex|Mix))?\s+-\s+/, "").trim();

type Listing = typeof listings.$inferSelect;

function describe(l: Listing, cutoutAt: Date | null, siteUrl: string | undefined) {
  const generic = l.source === "yoox" || l.title.trim().split(/\s+/).length <= 2;
  return {
    listingId: l.id,
    brand: l.brand,
    name: l.displayName && generic ? l.displayName : cleanTitle(l.title),
    store: l.store,
    priceCents: l.priceCents,
    image: siteUrl && cutoutAt ? `${siteUrl}/img/${l.id}?v=${cutoutAt.getTime()}` : (l.images[l.heroImage ?? 0] ?? l.images[0] ?? null),
    url: siteUrl ? `${siteUrl}/item/${l.id}` : l.url,
  };
}

const cutoutAt = orm.sql<Date | null>`(select c.created_at from ${cutouts} c where c.listing_id = ${listings.id})`.mapWith(
  (v: string | Date | null) => (v ? new Date(v) : null),
);

export async function findSaleAlerts(minDropPct: number, siteUrl: string | undefined): Promise<SaleAlert[]> {
  const alerts: SaleAlert[] = [];

  const saved = await db()
    .select({ s: saves, l: listings, cutoutAt })
    .from(saves)
    .innerJoin(listings, orm.eq(saves.listingId, listings.id))
    .where(orm.eq(listings.status, "active"));
  for (const { s, l, cutoutAt: cut } of saved) {
    const baseline = await priceWhenSaved(l, s.createdAt);
    const pct = Math.round((1 - l.priceCents / baseline) * 100);
    // Alert once per drop: a later alert needs a lower price than the last one sent.
    if (pct >= minDropPct && l.priceCents < (s.alertedPriceCents ?? baseline)) {
      alerts.push({ kind: "saved", saveId: s.id, wasCents: baseline, pct, ...describe(l, cut, siteUrl) });
    }
  }

  const watched = await db()
    .select({ w: watches, l: listings, cutoutAt })
    .from(watches)
    .innerJoin(listings, orm.eq(watches.bestListingId, listings.id))
    .where(orm.and(orm.eq(watches.active, true), orm.eq(listings.status, "active")));
  for (const { w, l, cutoutAt: cut } of watched) {
    const pct = l.retailCents ? Math.round((1 - l.priceCents / l.retailCents) * 100) : 0;
    const underTarget = w.maxPriceCents !== null && l.priceCents <= w.maxPriceCents;
    const already = w.alertedListingId === l.id && w.alertedPriceCents !== null && l.priceCents >= w.alertedPriceCents;
    if ((pct >= minDropPct || underTarget) && !already) {
      alerts.push({
        kind: "watch",
        watchId: w.id,
        watchLabel: w.label,
        wasCents: l.retailCents ?? l.priceCents,
        pct,
        ...describe(l, cut, siteUrl),
      });
    }
  }
  return alerts.sort((a, b) => b.pct - a.pct);
}

/** The price in effect when the piece was saved (latest price point at or before the save). */
async function priceWhenSaved(l: Listing, savedAt: Date): Promise<number> {
  const [atSave] = await db()
    .select({ c: pricePoints.priceCents })
    .from(pricePoints)
    .where(orm.and(orm.eq(pricePoints.listingId, l.id), orm.lte(pricePoints.seenAt, savedAt)))
    .orderBy(orm.desc(pricePoints.seenAt))
    .limit(1);
  if (atSave) return atSave.c;
  const [first] = await db()
    .select({ c: pricePoints.priceCents })
    .from(pricePoints)
    .where(orm.eq(pricePoints.listingId, l.id))
    .orderBy(pricePoints.seenAt)
    .limit(1);
  return first?.c ?? l.priceCents;
}

/** Remember what was sent so the same drop isn't emailed twice. */
export async function markAlerted(alerts: SaleAlert[]): Promise<void> {
  for (const a of alerts) {
    if (a.kind === "saved" && a.saveId) {
      await db().update(saves).set({ alertedPriceCents: a.priceCents }).where(orm.eq(saves.id, a.saveId));
    } else if (a.kind === "watch" && a.watchId) {
      await db()
        .update(watches)
        .set({ alertedListingId: a.listingId, alertedPriceCents: a.priceCents })
        .where(orm.eq(watches.id, a.watchId));
    }
  }
}

const INK = "#201f1d";
const MUTED = "#605d5d";
const ACCENT_INK = "#5a3b0a";
const SURFACE = "#eae9e9";
const SERIF = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
const BODY = "Lora, Georgia, 'Times New Roman', serif";

export function renderAlertEmail(alerts: SaleAlert[], siteUrl: string | undefined): { subject: string; html: string; text: string } {
  const first = alerts[0];
  const subject =
    alerts.length === 1 && first
      ? `Price drop: ${first.brand} ${first.name}, now ${usd(first.priceCents)} (−${first.pct}%)`
      : `${alerts.length} pieces you saved or watch just dropped in price`;

  const card = (a: SaleAlert) => {
    const img = a.image
      ? `<img src="${esc(a.image)}" width="140" height="140" alt="" style="display:block;width:140px;height:140px;object-fit:contain;background:${SURFACE}">`
      : `<div style="width:140px;height:140px;background:${SURFACE}"></div>`;
    const why = a.kind === "watch" ? `Watching: ${esc(a.watchLabel ?? "")}` : "You saved this";
    return `<tr><td valign="top" style="padding:0 16px 22px 0;width:140px"><a href="${esc(a.url)}">${img}</a></td><td valign="top" style="padding-bottom:22px"><div style="font:9px ${BODY};letter-spacing:.1em;text-transform:uppercase;color:${MUTED}">${esc(a.brand)}</div><a href="${esc(a.url)}" style="font:400 22px ${SERIF};color:${INK};text-decoration:none">${esc(a.name)}</a><div style="font:14px ${BODY};padding-top:6px"><span style="color:${ACCENT_INK}">${usd(a.priceCents)}</span> <span style="color:#7d7979;text-decoration:line-through">${usd(a.wasCents)}</span> <span style="color:${ACCENT_INK}">−${a.pct}%</span></div><div style="font:12px ${BODY};color:${MUTED};padding-top:4px">${esc(a.store)} · ${why}</div></td></tr>`;
  };

  const footer = siteUrl ? `<a href="${esc(siteUrl)}/saved" style="color:${MUTED}">Your saved pieces</a>` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f3f2f2"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f2f2"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="520" cellspacing="0" cellpadding="0" style="max-width:520px;color:${INK}"><tr><td colspan="2" style="font:400 32px ${SERIF};padding-bottom:20px">${alerts.length === 1 ? "A price just dropped" : "Prices just dropped"}</td></tr>${alerts.map(card).join("")}<tr><td colspan="2" style="padding-top:8px;font:11px ${BODY};color:${MUTED}">${footer}</td></tr></table></td></tr></table></body></html>`;
  const text = alerts
    .map((a) => `${a.brand} ${a.name}: ${usd(a.priceCents)} (was ${usd(a.wasCents)}, −${a.pct}%) at ${a.store}\n${a.url}`)
    .join("\n\n");
  return { subject, html, text };
}
