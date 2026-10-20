# Next session

Read PLAN.md first. Planning is done; no code exists yet.

Start Phase 1:
1. Scaffold a pnpm monorepo: apps/web (Next.js + TS + Tailwind), apps/worker (Node), packages/db (Drizzle + Postgres), packages/sources.
2. Schema for brands, listings, listing_images, price_points, ratings, saves, pins, embeddings, source_runs.
3. First adapters: Shopify /products.json (verify which brands in config/brands.yaml expose it) and eBay Browse API (keys to be set up live with Junaid).
4. Pinterest scrape of https://www.pinterest.com/junaidrbhatti/ into taste/ (pins + images), then draft taste/profile.md from them.
5. Feed view built from docs/design-handoff (uniform square tiles, no reason line, three-way rating: would wear / would not wear / inspo).

Seed the watchlist with Jo Malone Wood Sage & Sea Salt (wants it on sale).

Pending from Junaid: Pinterest boards to exclude, site name. Confirm the clothing_candidates URLs in config/brands.yaml.
