# Handoff: Personal Shopping Mall (v4)

## Overview
A personal, single-user shopping site that pools clothing (plus some fragrance and underwear) from ~22 brands the owner likes into one feed. It:
- Pulls **new stock** from brand sites and from department stores (Nordstrom, Macy's, Bloomingdale's).
- Pulls **secondhand / vintage** listings from **Depop** and **eBay**.
- **Constantly watches for sales** and surfaces them at the top of the feed (newest finds first, then biggest markdown).
- **Mixes brands** so no single brand runs more than twice in a row. There is no brand filtering in the main UI — a good mix should always be present.
- Generates **inspiration**: algorithm picks mixed into the feed (labeled "For you" with a reason) and 4-piece "looks" (outfits) built from feed items.
- Has a **search** that queries every source at once.

Site name: none for now (the header has no wordmark — leave room for one later).

## About the Design Files
`Personal Mall v4.dc.html` is a **design reference created in HTML** — a working prototype showing intended look and behavior, not production code. All listings are **mock data generated in the browser**; product images are placeholder color blocks. Recreate this design in the target codebase's environment (the repo `junebhatti/online-shopping-mall` is currently empty — a good default is **Next.js + TypeScript + Tailwind or CSS modules**, with a server/cron layer for ingestion). Open the HTML file directly in a browser to see it running (it needs `support.js` and the `_ds/` folder next to it).

## Fidelity
**High-fidelity** for layout, typography, color and interaction. Product imagery is placeholder — real product photos (on a light warm-grey ground, cut-out/flat-lay style) replace the colored blocks.

## Screens / Views

### Global header (sticky, top: 0, z 10)
- Grid: `auto minmax(0,1fr) auto`, gap 36.8px, padding 13.8px 27.6px, bg `#f3f2f2`, bottom border 1px `rgba(32,31,29,.16)`.
- **Nav** (left): `FEED`, `INSPIRATION`, `SAVED` (+ superscript count of saved items). Lora 12px, letter-spacing .08em, uppercase. Active: color `#5a3b0a`, 1px bottom border `#b68235`. Hover: `#7d5411`.
- **Search** (middle, fills): underline-only field (1px bottom border divider), Lucide `search` icon 15px `#7d7979`, Lora 13px input. Placeholder: `Search every source — “vintage Brooks Brothers oxford”, “Stone Island on sale”`. Enter submits. A ghost "Clear" button appears when there's text.
- **Settings** (right): 36×36 ghost icon button, Lucide `settings` 17px. Active color `#5a3b0a`.

### Sale-watch strip (below header)
- Single row, padding 7px 27.6px, Lora 11px `#605d5d`, bottom hairline.
- 6px accent dot `#b68235` pulsing (opacity 1→.25→1, 1.6s ease-in-out infinite).
- Text: `Watching {N} sources for sales — checking {source}` · italic `Last find: {brand} {name}, −{pct}% at {store}`. When paused: `Sale watch paused`.

### Feed (default view)
Main padding 27.6px 27.6px 120px; sections stacked with 56px gap. No page title.
1. **On sale now**
   - Header row: `ON SALE NOW` (11px, .1em, uppercase, `#5a3b0a`) + `{n} found` + right-aligned italic `newest finds first, then biggest markdown`; 1px bottom border `#facb8d`.
   - Grid: `repeat(auto-fill, minmax(150px,1fr))`, column gap 8px, row gap 18.4px. Shows 12, with a ghost button `Show all {n} markdowns` / `Show fewer`.
   - Tile: square (1:1), bg `#eae9e9`, product image centered. Top-left stacked micro-labels (9px, .08em, uppercase): `−40%` in `#5a3b0a`, `JUST FOUND` in `#605d5d` if new. Top-right 30×30 heart (Lucide `heart` 14px, outline `#7d7979`; saved = filled `#b68235`).
   - Caption (11px/1.35): brand (9px caps .1em `#605d5d`, prefixed `Vintage` for vintage brands) / name (single line, ellipsis) / row: sale price `#5a3b0a`, struck-through original `#7d7979`, store name right-aligned.
2. **Today’s looks** (hidden when a brand is temporarily isolated)
   - Header: `TODAY’S LOOKS` + italic `outfits put together from what’s on the feed` + ghost `All looks →` (goes to Inspiration).
   - Grid of looks: `repeat(auto-fill, minmax(min(100%,560px),1fr))`, gap 36.8px / 27.6px. Feed shows 2 looks.
   - Each look: 4 equal columns (gap 8px) of 3:4 tiles — outerwear, top, bottom, accessory/fragrance — each with brand caps + `name · $price`. Clicking a piece toggles saved (♥ appears top-right). Below: title in Cormorant Garamond 20px (e.g. "Workwear, washed"), italic reason `built around your {saved item}` in `#5a3b0a`, right-aligned `${total} together`.
3. **Just listed**
   - Header: `JUST LISTED` + count + right-aligned **dual-thumb price slider** ($0 → $500+, step 5; 150px wide; 1px track `#bab6b6`, selected range `#b68235`; thumbs 13px circles, bg `#f3f2f2`, 1px `#b68235` border). Min and max must stay ≥ $10 apart.
   - Same grid/tile as the sale grid. Top-left micro-labels: `FOR YOU` (`#5a3b0a`) for algorithm picks, `JUST IN` for items that arrived in the last ~12s, `90s · DEPOP` / `USED · EBAY` for secondhand. Caption row: price + right meta (color for new; `size · condition` for used; `100 ml` for fragrance). Picks add an italic reason line in `#5a3b0a` (e.g. `like your saved Detroit Jacket`, `90s, your size`, `62% under retail`).
   - Excludes sale items (they're already at the top). Ordered by brand-mix algorithm (see below).

### Inspiration
- **Looks** section with 8 looks (same component), then **Pieces picked for you** grid: 36 clothing-only picks (no fragrance or underwear), each with a reason line.

### Saved
- Grid of saved items, same tile. Empty state: Cormorant italic 22px `Nothing saved yet.`

### Search results
- Title: the query in Cormorant Garamond 40px in curly quotes, plus `Searching… {k} of {N} sources` → `{n} pieces from {N} sources`.
- Then "On sale now" (matching sale results) and "Results" grid.
- Supported query hints: `vintage` (secondhand only), `sale` (sale only), `under $N` (price cap). Free text matches brand, item name, category, color.

### Settings (gear icon)
- Two columns `2fr / 1fr`, gap 72px, max-width 1200px.
- Left: `Settings` (Cormorant 44px, weight 400), justified 13px intro copy: "The feed always mixes every brand below, so no single label takes over. Tap a name to look at just that brand for a moment."
- Brand groups, each with a 1px `#201f1d` top-rule label row (10px caps) + italic note, then rows (grid `1fr 1.4fr 60px`, 9px vertical padding, hairline separators): brand name (Cormorant 19px), italic note, item count. Clicking a brand returns to Feed showing only that brand, with an outlined tag `Only {brand} ×` to clear.
  - **Clothing** — Buck Mason, Ralph Lauren, Nudie Jeans, Carhartt, Basketcase Gallery, LA Apparel, Maison Margiela, Acne Studios, Stone Island, rag & bone, Theory, Lululemon, Banana Republic, Merz b. Schwanen
  - **Vintage** (Depop & eBay only) — Patagonia, Woolrich, Russell Athletic, Gap, Brooks Brothers
  - **Fragrance** — Jo Malone, Jean Paul Gaultier, Maison Margiela (Replica)
  - **Essentials** — Calvin Klein (underwear)
- Right column: **Sale watch** list (Nordstrom, Macy’s, Bloomingdale’s, Brand sites, Depop/eBay price drops); **Sizes** tags (placeholder: Tops M, Waist 32, Inseam 30, Shoe 10 — confirm with owner); **Refresh** segmented control Live / Paused.

## Interactions & Behavior
- **Live stream**: every ~6s, 1–2 new items prepend to the feed with `JUST IN` (label clears after ~12s). Fade-in 0.5s.
- **Sale scanner**: cycles through all sources (~1.4s per source in the prototype); on a hit, a sale item is prepended and the strip shows "Last find". In production this should be a background job (cron/queue) + realtime push (SSE/websocket) or polling.
- **Brand mix**: when ordering a grid, greedily pick the next item whose brand isn't in the last 2 placed. Apply to the feed and the sale grid.
- **Sale ordering**: newly found first, then by % off descending.
- **Save**: heart toggles; saved items appear in Saved and are used as anchors for looks/reasons.
- **Looks**: one item each from outer / top / bottom / extra slots; anchored to a saved item.
- **Picks** (~30% of non-sale feed items): reasons come from similarity to saved items, vintage-in-size, % under retail, or "new color for you". Replace with a real recommender (e.g. embeddings of product images/text vs. saved items).
- Focus: `:focus-visible { outline: 2px solid #b68235; outline-offset: 2px }`. Hover tints from the accent ramp; never browser-default blue.

## State Management
- `view`: feed | inspo | saved | search | settings
- `items[]`: { id, brand, name, category, slot, color, price, retail, used, vintage, decade, condition, size, source, sale?{pct, was, store}, isNew, saved, isPick }
- `brandIsolate` (nullable), `minPrice`, `maxPrice`, `saleShowAll`, `paused`
- `query`, `searchResults`, `searchProgress`
- Data: ingestion per source (brand site scrapers/feeds, department-store sale pages, Depop + eBay APIs/search), normalized into the schema above, deduped, filtered to owner's sizes.

## Design Tokens (Classical design system — `_ds/.../styles.css`)
- Ground `#f3f2f2`, surface (tile bg) `#eae9e9`, text `#201f1d`, accent `#b68235`, divider `rgba(32,31,29,.16)`
- Neutral ramp 100–900: `#f8f4f4 #eae7e7 #d7d3d3 #bab6b6 #9b9797 #7d7979 #605d5d #444141 #2d2b2b`
- Accent ramp 100–900: `#fff3e4 #ffe3bf #facb8d #e1ad66 #c28d41 #a06f24 #7d5411 #5a3b0a #3a270d`
- Fonts: headings **Cormorant Garamond** (display at weight 400; UI headings max 600), body **Lora**. No sans-serif. Tabular figures (`font-feature-settings: "tnum"`) on prices/counts.
- Spacing: 4.6 / 9.2 / 13.8 / 18.4 / 27.6 / 36.8 px
- Radius: 2 / 4 / 7 px
- Shadows: sm `0 1px 2px rgba(45,43,43,.14)`, md `0 3px 10px rgba(45,43,43,.16)`, lg `0 12px 32px rgba(45,43,43,.22)`
- Buttons are outlined/ghost, never solid-filled.

## Assets
- Icons: Lucide (`search`, `settings`, `heart`).
- Product images: none yet — placeholders. Use source product photos, ideally normalized onto a light ground and center-cropped square.

## Files
- `Personal Mall v4.dc.html` — the prototype (template markup + logic class with mock data generator, mix algorithm, look builder, search, timers)
- `support.js` — runtime needed to open the prototype in a browser
- `_ds/classical-74f217c9-8e1d-4882-a318-2d996f8a6fb5/styles.css` — design tokens and component classes (`.btn`, `.tag`, `.seg`, etc.)
