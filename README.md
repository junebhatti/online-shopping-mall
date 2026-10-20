# online-shopping-mall

A personal shopping mall: one curated feed of new stock, vintage and resale from the brands I like,
refreshed every few hours by agents that score every listing against my taste and watch saved items
for price drops. Anyone can browse; only the owner can rate and save.

- Plan and decisions: [PLAN.md](PLAN.md)
- Design reference (v4): [docs/design-handoff/HANDOFF.md](docs/design-handoff/HANDOFF.md)
- What I like: [taste/profile.md](taste/profile.md), [config/taste.yaml](config/taste.yaml)
- Brands, sizes, rules: [config/](config)

## How it works

```
sources (Shopify stores, eBay, Pinterest)
  -> listings in Postgres
  -> gate: size and measurements, price ceilings, condition and damage, fakes, shipping, loud colors
  -> score: local CLIP image embeddings vs. Pinterest pins, taste phrases and your ratings
  -> judge: Claude Haiku reads taste/profile.md and the photos for the top candidates
  -> admit: about 20 a day into the feed, deduped, no store over 40% of a batch
  -> cutouts: background removal so products sit on the tile ground
```

`apps/worker` runs that loop (resale every 2 hours, brand sites twice a day, Pinterest daily).
`apps/web` is the Next.js site. Every source run is recorded, and failures show in Settings.

## Run it locally

Needs Node 22+ and Homebrew Postgres 17 (`brew install postgresql@17`).

```bash
npm install
```

```bash
cp .env.example .env.local
```

Fill in `.env.local`: `AUTH_SECRET` and `OWNER_PASSWORD` at least. eBay and Claude keys are optional;
without them those steps record a failed run and the rest keeps working.

```bash
npm run db:start
```

```bash
npm run db:migrate
```

```bash
npm run worker:once
```

```bash
npm run dev
```

The site runs at http://localhost:3100. `npm run worker` keeps the loop running; `npm run worker:once -- --only=shopify,gate`
runs chosen steps. The first worker run downloads two image models (about 600 MB) into `.cache/`.

```bash
npm test
```
