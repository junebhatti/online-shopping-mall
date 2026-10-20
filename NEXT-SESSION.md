# Next session

Read PLAN.md first. Phase 1 is built and runs locally (2026-10-20). Nothing is deployed yet.

## State

- Local Postgres: `npm run db:start` (data in `.data/pg`, port 54329). Migrations: `npm run db:migrate`.
- Site: `npm run dev`, then http://localhost:3100. Owner password is `OWNER_PASSWORD` in `.env.local`
  (a generated test value; Junaid should change it).
- Worker: `npm run worker:once` runs every step once; `npm run worker` loops.
- Data so far: about 5,600 Shopify products (LA Apparel, Alo, Pool House), 132 Pinterest pins,
  about 357 listings past the gate, 35 admitted to the feed, cutouts for the feed items.
- Tests: `npm test` (gate rules, categorizer, eBay mapping, brand mix). `npm run typecheck`, `npm run build` both clean.

## Do next, in order

1. **eBay keys, live with Junaid.** developer.ebay.com, create a production keyset, put
   `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` in `.env.local`. Then
   `npm run worker:once -- --only=ebay,gate,embed,score,admit,cutouts`. Check that category ids
   1059 (men's clothing) and 93427 (men's shoes) in packages/sources/src/ebay.ts behave, and that
   size aspects and measurements parse on real items. eBay is the main route to the brands whose
   own sites block scraping (Ralph Lauren, Stone Island, Margiela, Acne, Buck Mason, etc.).
2. **Claude API key** (`ANTHROPIC_API_KEY`) so the Haiku judge runs. Until then Settings shows it
   failing and admission uses `judge.min_score_without_judge` from config/taste.yaml.
3. **Deploy.** Neon for Postgres (run migrations against it), Vercel for apps/web (root directory
   apps/web, env: DATABASE_URL, AUTH_SECRET, OWNER_PASSWORD), Railway for the worker
   (`npm run worker`, all env vars). The worker loads two image models (~600 MB on disk, ~2 GB RAM);
   give Railway a volume for `.cache/` so it doesn't re-download on every deploy. Untested on Vercel:
   that `packages/config` finds `config/` from the traced build (it walks up from the working directory;
   `MALL_ROOT` overrides).
4. **Week-one rating sessions** at /rate (30 a day). Ratings feed the scorer on the next cycle.
5. **Phase 2 resale** (PLAN.md): Depop first, then Grailed, Vinted, Poshmark/Mercari, TheRealReal/Vestiaire.

## Ask Junaid

- Confirm the price ceilings marked "guess" in config/rules.yaml.
- Confirm Claude's read of the Pinterest boards in taste/profile.md ("From the Pinterest boards").
  Notable: striped knits and a leather bomber are pinned, which loosens two earlier answers.
- Vibes + aesthetic and scrapbook boards are set to `mood` (shown in Inspiration, not scored). OK?
- Site name. Clothing candidates without working feeds: Peoples Fortune, Atelier Taro, Shapes, Brut Archives.

## Known gaps

- Only three brand stores expose Shopify JSON; the rest return 403 or aren't Shopify.
- A store's first image is often on a model, and cutouts keep the model. Picking a flat-lay image is a later improvement.
- Price history is a list on the item page, not a chart yet. Daily digest email is Phase 3.
- v4's Live/Paused refresh control isn't built; Settings shows the cadence instead.
- Tapping a brand in Settings opens a search for it rather than an "Only {brand}" feed filter.
- Owner login has no rate limiting.
- Pinterest's widget API returns at most 50 pins per board (all boards are under that today).
