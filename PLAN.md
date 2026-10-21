# Personal Shopping Mall — Plan

Decisions from the planning session on 2026-10-19/20. This is the source of truth for scope.
The design is in `docs/design-handoff/HANDOFF.md` (v4) and is built as designed unless noted here.

## What it is

A single-owner shopping site that pools new stock from brands Junaid likes, plus vintage and
resale listings, into one curated feed. Agents refresh listings every 2 hours, score each
item against a taste model built from Pinterest and in-app ratings, admit only ~20 items a
day, and watch saved items, emailing only when one goes meaningfully on sale.

Anyone can view the site. Only the owner (password) can rate, save, or change settings.
No site name yet; header leaves room for a wordmark.

## Decisions

### Sources
| Source | Decision | Method |
|---|---|---|
| Brand sites | Phase 1 | Shopify `/products.json` where available; custom scrapers otherwise |
| eBay | Phase 1 | Official Browse API (set up developer keys live with Junaid) |
| Depop | Phase 2 | Internal JSON endpoints; must fail loudly and alert when broken |
| Grailed, Vinted, Poshmark, Mercari, TheRealReal, Vestiaire | Phase 2 | Per-site adapters, same risk posture as Depop |
| SSENSE, Yoox, Farfetch | Phase 4 | Luxury sale coverage for Margiela, Acne, Stone Island |
| Nordstrom, Macy's, Bloomingdale's | Phase 4, best effort | Heavily protected; no paid proxies in budget |
| Facebook Marketplace | Skipped | No API, login-walled, anti-bot |
| Pinterest | Phase 1 | Scrape public boards at https://www.pinterest.com/junaidrbhatti/ once, refresh occasionally |
| Instagram | Later | Named references in the taste profile only; no scraping |

Region: US sellers, USD only.
Categories: clothing, fragrance (Jo Malone, JPG, Margiela Replica), essentials (Calvin Klein underwear) all from day one.
Brand list lives in `config/brands.yaml` and grows over time from ratings. Arc'teryx and Alo added at planning.

### Fit and condition
- Sizes: tops M, waist 32, inseam 30, shoe 10. Height 5'10", 155–160 lb.
- Always match size M, and also check measurements when the listing has them:
  roughly 26" top-to-bottom length and 22–23" chest is the target for tops.
- Condition: reject real damage (large holes, big paint marks, stains). Light wear is fine.
  Rank excellent / like-new / great quality above everything else.
- Vintage eras that matter: 90s outdoor, athletic/sweats, Ivy/prep, military/workwear.

### Taste model
Three signals, combined:
1. **Editable taste profile** — `taste/profile.md`, written by the agent from pins and brands, corrected by Junaid anytime.
2. **Image embeddings** — product photos compared to Pinterest pins and liked items.
3. **In-app ratings** — three-way on every tile: **Would wear / Would not wear / Inspo**
   (inspo = like the look, keep for general inspiration, not a wear signal).

Rules:
- No reason line on tiles (v4 showed one; removed).
- Target ~20 admitted items per day. Prefer missing things over showing junk.
- Hard reject: loud colors (neon, bright primaries, busy patterns).
- Vibe words: workwear/Americana, Ivy/prep, quiet luxury/minimal, gorpcore/outdoor.
- Week one: a daily 10-minute rating session of ~30 items to sharpen the model.

### Likes vs saves
- **Like (would wear)** trains taste only.
- **Save (heart)** is the watchlist: saved items are tracked for price drops and restocks.
  Saved searches are deferred (worry: not enough inventory for them to be useful).
- No boards or collections.

### Deals and alerts
- Price history per listing; same-item matching across brand sites and retailers;
  resale-vs-retail gap flagged on used listings.
- Alert on **any** price drop of a saved item.
- **Sale alerts only** (changed 2026-10-21; no daily digest): one email when a saved piece drops 15%+ below its
  price when saved, or a watch's best match is marked down 15%+ (`alerts.min_drop_pct` in config/rules.yaml).
  One email per drop; a further drop sends another.
- Keep sold/expired listings (hidden) for price history.

### Design and UX
- Build v4 as designed: Cormorant Garamond + Lora, ground `#f3f2f2`, accent `#b68235`, outlined buttons only, uniform square tiles.
- Background removal on product images so everything sits on the grey ground.
- Both light and dark mode (follow system); dark palette derived from the tokens.
- Desktop and phone equally.
- Item click opens an in-app detail page: price history, size/measurements, similar items, link out to buy.
- Search: instant over ingested listings, plus a live eBay/Depop query for vintage searches.
- **Dropped for v1:** Today's Looks / outfit builder, pick reason lines.

### Stack and hosting
- Next.js + TypeScript + Tailwind on Vercel.
- Postgres on Neon (or Supabase). Drizzle for schema and migrations.
- Worker: small always-on Node process on Railway (or Fly) running ingestion, scoring,
  background removal, price checks, and sale alerts. Refresh every 2 hours (resale), twice daily (brand sites).
- Budget: under $25/month total for hosting, proxies (none), and Claude API.
  Use Claude Haiku for batched text classification; open CLIP-style embeddings on the worker; Claude vision only for borderline items.
- Secrets in `.env.local`, never committed.

## Architecture (as built)

```
apps/web          Next.js 16 site: feed, inspiration, saved, rating session, search, item, settings, owner login
apps/worker       Loop: ingest -> gate -> embed -> score -> judge -> admit -> cutouts
packages/db       Drizzle schema, migrations and client shared by web and worker
packages/sources  Adapters: Shopify /products.json, eBay Browse API, Pinterest widget API
packages/config   Loads and validates config/*.yaml
config/           brands, rules (sizes, ceilings, condition), taste anchors, queries, pinterest boards, watches
taste/            profile.md, read by the Claude judge
```

Tables: `listings` (category-agnostic, JSON attributes, gate/score/judge/admission state),
`price_points`, `cutouts` (WebP bytes), `ratings`, `saves`, `watches`, `pins`, `source_runs`.
Embeddings are `real[]` columns on listings and pins, compared in the worker.

## Phases

1. **Foundation + feed** — done locally 2026-10-20: scaffold, schema, owner auth, Shopify + eBay adapters,
   Pinterest pins, CLIP scoring, Claude judge, feed with three-way rating, rating session, background removal.
2. **Resale** — done 2026-10-20 for the sites that allow it:
   - Working: **Grailed** (public Algolia search + detail with measurements), **Poshmark** (public search JSON),
     **Vinted** (catalogue search with the anonymous visitor token; search only), **eBay** (built, keys pending).
   - Blocked from this Mac, left out: **Depop**, **Mercari**, **Vestiaire** (Cloudflare blocks every request),
     **The RealReal** (its API only answers when the client works around its bot detection, which we don't do).
3. **Saves + alerts** — done 2026-10-20: price history chart, cross-store matches, resale-vs-retail gap,
   watches, sale alert emails (send once `RESEND_API_KEY` and `ALERT_TO` are set; preview at /alerts).
4. **Luxury + department stores** — partly done:
   - Working: **Yoox** men's sale for every brand it carries (public Algolia search).
   - Blocked: **SSENSE** (Cloudflare challenge), **Farfetch** (Akamai blocks after ~12 requests),
     Nordstrom / Macy's / Bloomingdale's not attempted (heavily protected).
   - Still to do: brand-list growth from ratings.

## Beyond clothing (future, shapes the schema now)

Down the line the mall grows into a hub for everything Junaid buys, not just clothes:
- **Rebuy shelf** — things bought on a cycle (creatine, toiletries, coffee) sit in their own
  department with an expected rebuy interval, get resurfaced when they are probably running low,
  and have agents watching for price drops across Amazon and the usual stores.
- **General wishlists** — any item by URL, any category, watched for drops and restocks.
- **Discovery for other departments** — eBay and resale scanned for furniture, home goods, and
  other useful or interesting objects, with their own taste signal separate from clothing.

Consequences for Phase 1 so this does not need a rewrite later:
- `listings` is category-agnostic: a core row (source, url, title, brand, price, currency,
  condition, images, status) plus a JSON `attributes` column for category-specific fields
  (size, measurements, fit, volume for fragrance, dimensions for furniture).
- A `departments` concept from day one (clothing, fragrance, essentials now; home, supplements
  later). Every listing, rating, and taste profile belongs to a department, so the clothing
  model never scores a desk lamp.
- Sources are adapters that can serve more than one department (eBay already does).
- Saves carry an optional `rebuy_interval_days` and `last_bought_at` so the rebuy shelf is a
  view over saves, not a new system.
- The design system and tile component stay neutral enough to hold a chair or a tub of creatine.

## Open items
- eBay developer account: email confirmation, then keys (in progress with Junaid).
- Resend account for sale alerts (`RESEND_API_KEY`, `ALERT_TO`).
- Deploy: Neon, Vercel, Railway (docs/DEPLOY.md).
- Confirm the price ceilings marked "guess" in config/rules.yaml.
- Confirm Claude's read of the Pinterest boards in taste/profile.md.
- Site name.
