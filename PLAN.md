# Personal Shopping Mall — Plan

Decisions from the planning session on 2026-10-19/20. This is the source of truth for scope.
The design is in `docs/design-handoff/HANDOFF.md` (v4) and is built as designed unless noted here.

## What it is

A single-owner shopping site that pools new stock from brands Junaid likes, plus vintage and
resale listings, into one curated feed. Agents refresh listings every 2 hours, score each
item against a taste model built from Pinterest and in-app ratings, admit only ~20 items a
day, watch saved items for any price drop, and send one daily digest email.

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
- One **daily digest email**: drops on saved items, new admitted items, notable resale gaps.
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
  background removal, price checks, and the digest. Refresh every 2 hours (resale), twice daily (brand sites).
- Budget: under $25/month total for hosting, proxies (none), and Claude API.
  Use Claude Haiku for batched text classification; open CLIP-style embeddings on the worker; Claude vision only for borderline items.
- Secrets in `.env.local`, never committed.

## Architecture sketch

```
apps/web        Next.js site (feed, detail, saved, settings, rating session, owner auth)
apps/worker     Cron loop: ingest -> normalize -> dedupe -> gate (size, condition, region)
                -> score (embeddings + profile) -> admit -> background removal -> price checks -> digest
packages/db     Drizzle schema + client shared by web and worker
packages/sources One adapter per source implementing { id, listNew(), refreshPrice(listing) }
config/         brands.yaml, sizes, thresholds
taste/          profile.md (editable), pins snapshot
```

Core tables: `brands`, `listings`, `listing_images`, `price_points`, `ratings`, `saves`,
`pins`, `embeddings`, `source_runs` (status + errors per run, so failures are visible).

## Phases

1. **Foundation + feed** — repo scaffold, schema, owner auth, eBay + Shopify brand adapters,
   Pinterest scrape -> taste profile + pin embeddings, scoring pipeline, feed with three-way rating,
   rating session view, background removal, worker deployed.
2. **Resale** — Depop, Grailed, Vinted, Poshmark/Mercari, TheRealReal/Vestiaire; measurement
   parsing; condition gate; live resale search.
3. **Saves + alerts** — save = watch, price history, cross-store matching, resale-vs-retail gap,
   daily digest email, detail page price chart.
4. **Luxury + department stores** — SSENSE, Yoox, Farfetch; Nordstrom/Macy's/Bloomingdale's best effort;
   dark mode polish; brand-list growth from ratings.

## Open items
- Set up eBay developer keys together (live session).
- Which Pinterest boards to exclude, if any.
- Instagram accounts to reference (agent scanning the following list; Junaid will pick).
- Site name.
