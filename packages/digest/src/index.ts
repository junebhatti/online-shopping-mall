import { cutouts, db, listings, orm, pricePoints, saves, watches } from "@mall/db";

const DAY = 24 * 3_600_000;

const usd = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const name = (title: string) => title.replace(/^[A-Z0-9][A-Z0-9.-]{2,}(?:\s+(?:Unisex|Mix))?\s+-\s+/, "").trim();

export type DigestItem = {
  id: number;
  brand: string;
  name: string;
  store: string;
  priceCents: number;
  wasCents?: number;
  image: string | null;
  url: string;
};

export type Digest = {
  subject: string;
  html: string;
  text: string;
  drops: DigestItem[];
  gone: DigestItem[];
  watched: { label: string; best: DigestItem | null; underTarget: boolean }[];
  fresh: DigestItem[];
  empty: boolean;
};

/**
 * Yesterday in the mall: price drops and sell-outs on saved items, the best current
 * price for each watch, and what was admitted to the feed. `siteUrl` makes links and
 * cutout images point at the deployed site.
 */
export async function buildDigest(siteUrl: string | undefined, now = new Date()): Promise<Digest> {
  const since = new Date(now.getTime() - DAY);
  const item = (l: typeof listings.$inferSelect, hasCutout: boolean, wasCents?: number): DigestItem => ({
    id: l.id,
    brand: l.brand,
    name: name(l.title),
    store: l.store,
    priceCents: l.priceCents,
    wasCents,
    image: siteUrl && hasCutout ? `${siteUrl}/img/${l.id}?cut=1` : (l.images[0] ?? null),
    url: siteUrl ? `${siteUrl}/item/${l.id}` : l.url,
  });
  const withCutout = orm.sql<boolean>`exists (select 1 from ${cutouts} c where c.listing_id = ${listings.id})`;

  // Saved items whose newest price point (in the last day) is below the one before it.
  const savedRows = await db()
    .select({ l: listings, hasCutout: withCutout })
    .from(saves)
    .innerJoin(listings, orm.eq(saves.listingId, listings.id));
  const drops: DigestItem[] = [];
  const gone: DigestItem[] = [];
  for (const { l, hasCutout } of savedRows) {
    if (l.status !== "active") {
      if (l.updatedAt >= since) gone.push(item(l, hasCutout));
      continue;
    }
    const pts = await db()
      .select()
      .from(pricePoints)
      .where(orm.eq(pricePoints.listingId, l.id))
      .orderBy(orm.desc(pricePoints.seenAt))
      .limit(2);
    const [latest, previous] = pts;
    if (latest && previous && latest.seenAt >= since && latest.priceCents < previous.priceCents) {
      drops.push(item(l, hasCutout, previous.priceCents));
    }
  }

  const watchRows = await db()
    .select({ w: watches, l: listings, hasCutout: withCutout })
    .from(watches)
    .leftJoin(listings, orm.eq(watches.bestListingId, listings.id))
    .where(orm.eq(watches.active, true));
  const watched = watchRows.map(({ w, l, hasCutout }) => ({
    label: w.label,
    best: l ? item(l, Boolean(hasCutout), l.retailCents ?? undefined) : null,
    underTarget: Boolean(l && w.maxPriceCents && l.priceCents <= w.maxPriceCents),
  }));

  const freshRows = await db()
    .select({ l: listings, hasCutout: withCutout })
    .from(listings)
    .where(orm.and(orm.gte(listings.admittedAt, since), orm.eq(listings.status, "active")))
    .orderBy(orm.desc(listings.score))
    .limit(20);
  const fresh = freshRows.map(({ l, hasCutout }) => item(l, hasCutout, l.retailCents ?? undefined));

  const empty = drops.length + gone.length + fresh.length === 0 && !watched.some((w) => w.best);
  const subject = drops.length
    ? `${drops.length} price ${drops.length === 1 ? "drop" : "drops"} on saved pieces, ${fresh.length} new in the feed`
    : `${fresh.length} new in the feed`;

  return { subject, html: renderHtml({ drops, gone, watched, fresh }, siteUrl), text: renderText({ drops, gone, watched, fresh }), drops, gone, watched, fresh, empty };
}

type Parts = Pick<Digest, "drops" | "gone" | "watched" | "fresh">;

const INK = "#201f1d";
const MUTED = "#605d5d";
const ACCENT_INK = "#5a3b0a";
const SURFACE = "#eae9e9";
const SERIF = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
const BODY = "Lora, Georgia, 'Times New Roman', serif";

function section(title: string, body: string): string {
  return `<tr><td style="padding:28px 0 8px;font:11px ${BODY};letter-spacing:.1em;text-transform:uppercase;color:${ACCENT_INK};border-bottom:1px solid #facb8d">${esc(title)}</td></tr><tr><td style="padding-top:12px">${body}</td></tr>`;
}

function tile(i: DigestItem): string {
  const price = i.wasCents && i.wasCents > i.priceCents
    ? `<span style="color:${ACCENT_INK}">${usd(i.priceCents)}</span> <span style="color:#7d7979;text-decoration:line-through">${usd(i.wasCents)}</span>`
    : usd(i.priceCents);
  const img = i.image
    ? `<img src="${esc(i.image)}" width="150" height="150" alt="" style="display:block;width:150px;height:150px;object-fit:contain;background:${SURFACE}">`
    : `<div style="width:150px;height:150px;background:${SURFACE}"></div>`;
  return `<td valign="top" style="width:150px;padding:0 8px 18px 0"><a href="${esc(i.url)}" style="color:${INK};text-decoration:none">${img}<div style="font:9px ${BODY};letter-spacing:.1em;text-transform:uppercase;color:${MUTED};padding-top:6px">${esc(i.brand)}</div><div style="font:12px ${BODY};line-height:1.35">${esc(i.name)}</div><div style="font:12px ${BODY}">${price} <span style="color:#7d7979">· ${esc(i.store)}</span></div></a></td>`;
}

function grid(items: DigestItem[]): string {
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += 3) rows.push(`<tr>${items.slice(i, i + 3).map(tile).join("")}</tr>`);
  return `<table role="presentation" cellspacing="0" cellpadding="0">${rows.join("")}</table>`;
}

function renderHtml(p: Parts, siteUrl: string | undefined): string {
  const blocks: string[] = [];
  if (p.drops.length) blocks.push(section("Price drops on saved pieces", grid(p.drops)));
  if (p.gone.length) blocks.push(section("Sold or gone", grid(p.gone)));
  if (p.watched.length) {
    const rows = p.watched
      .map((w) => `<tr><td style="font:13px ${BODY};padding:6px 0;border-bottom:1px solid #dcdada">${esc(w.label)}</td><td align="right" style="font:13px ${BODY};padding:6px 0;border-bottom:1px solid #dcdada">${w.best ? `<a href="${esc(w.best.url)}" style="color:${w.underTarget ? ACCENT_INK : INK}">${usd(w.best.priceCents)} at ${esc(w.best.store)}</a>` : `<span style="color:${MUTED};font-style:italic">not found yet</span>`}</td></tr>`)
      .join("");
    blocks.push(section("Watching", `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table>`));
  }
  if (p.fresh.length) blocks.push(section("New in the feed", grid(p.fresh)));
  const footer = siteUrl ? `<a href="${esc(siteUrl)}" style="color:${MUTED}">Open the mall</a>` : "";
  return `<!doctype html><html><body style="margin:0;background:#f3f2f2"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f2f2"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="520" cellspacing="0" cellpadding="0" style="max-width:520px;color:${INK}"><tr><td style="font:400 34px ${SERIF};padding-bottom:4px">Yesterday in the mall</td></tr>${blocks.join("") || `<tr><td style="font:italic 18px ${SERIF};color:${MUTED};padding-top:16px">A quiet day. Nothing new got in.</td></tr>`}<tr><td style="padding-top:28px;font:11px ${BODY};color:${MUTED}">${footer}</td></tr></table></td></tr></table></body></html>`;
}

function renderText(p: Parts): string {
  const line = (i: DigestItem) => `- ${i.brand} ${i.name}: ${usd(i.priceCents)}${i.wasCents ? ` (was ${usd(i.wasCents)})` : ""} at ${i.store} ${i.url}`;
  return [
    "Yesterday in the mall",
    p.drops.length ? `\nPrice drops on saved pieces\n${p.drops.map(line).join("\n")}` : "",
    p.gone.length ? `\nSold or gone\n${p.gone.map(line).join("\n")}` : "",
    p.watched.length ? `\nWatching\n${p.watched.map((w) => `- ${w.label}: ${w.best ? `${usd(w.best.priceCents)} at ${w.best.store}` : "not found yet"}`).join("\n")}` : "",
    p.fresh.length ? `\nNew in the feed\n${p.fresh.map(line).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
