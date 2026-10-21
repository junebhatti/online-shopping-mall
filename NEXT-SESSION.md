# Next session

Read PLAN.md first (the Phases section has per-source status).

## Deploy status (2026-10-20, paused here)

- **Neon**: live. A full copy of the local database (11,269 listings, 58-piece feed, cutouts, pins, judge verdicts)
  was loaded with `scripts/copy-to-neon.sh`. Its URL is `NEON_DATABASE_URL` in `.env.local`.
- **Vercel**: live, root directory `apps/web`, env `DATABASE_URL`, `AUTH_SECRET` (= `PROD_AUTH_SECRET` in .env.local),
  `OWNER_PASSWORD` (Junaid's own). `apps/web/vercel.json` installs only the web workspace. Ask Junaid for the URL,
  then add `SITE_URL` in Vercel and redeploy.
- **Railway**: not started. Nothing refreshes the Neon data until the worker runs there (docs/DEPLOY.md step 2:
  volume at `/app/.cache`, 2 GB RAM, env vars including `DATABASE_URL` = the Neon URL and `SITE_URL`).
  `worker.Dockerfile` has never been built; watch the first Railway build log.
- The local worker writes to the local database only, so local and Neon drift apart from here.
- **Schema changes: migrate Neon before pushing.** Vercel deploys on every push and its queries select every
  listing column, so a column the code expects but Neon lacks breaks the live site. Use the non-pooled URL:
  `DATABASE_URL="<NEON_DATABASE_URL with -pooler. replaced by .>" npm run db:migrate`. Migration 0002 is on both.

## State (2026-10-20, evening)

- Start: `npm run db:start`, then `npm run dev` (http://localhost:3100) and `npm run worker` for the loop.
  `npm run worker:once -- --only=<jobs>` runs chosen jobs: pinterest, shopify, yoox, ebay, grailed, poshmark,
  vinted, then recheck, watches, gate, embed, score, judge, admit, cutouts, and alerts.
- Sources live: Shopify (LA Apparel, Alo, Pool House), Yoox men's sale, Grailed, Poshmark, Vinted, Pinterest.
  About 1,100 listings past the gate, 60 admitted to the feed (20 a day from here).
- eBay adapter is built and recorded as failing until keys exist.
- Claude judge is live (key added 2026-10-20). It judges 30 per cycle, about $0.002 per batch; only verdicts with
  fit >= 7 (`judge.min_fit` in config/taste.yaml) reach the feed. All 58 pieces in the feed passed it.
- No daily digest (Junaid's call, 2026-10-21). Sale alerts are checked every cycle and email only when a saved piece
  drops 15%+ below its price when saved, or a watch is marked down 15%+. Unsent alerts wait (copy in `.data/alerts`)
  until Resend is configured. Preview at /alerts. Tested with a simulated drop on 2026-10-21, then cleaned up.
- Owner password: `OWNER_PASSWORD` in `.env.local` (a generated test value).
- `npm test` (44 tests), `npm run typecheck`, `npm run build` all clean.

## Waiting on Junaid

1. **eBay**: the developer account needs its email confirmed (nothing had arrived in the Gmail inbox; check spam or
   re-send from the page). Then: developer.ebay.com, Application Keys, create a production keyset, and handle the
   marketplace account deletion notice. The mall stores listing data only, no eBay user data, so the exemption applies;
   let Junaid confirm the wording. Put `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` in `.env.local`, then
   `npm run worker:once -- --only=ebay,gate,embed,score,admit,cutouts` and check categories 1059 / 93427 and size aspects.
2. **Resend** for sale alerts (`RESEND_API_KEY`, `ALERT_TO`); `onboarding@resend.dev` can send to the signup address.
3. **Deploy** per docs/DEPLOY.md.

## Next to build

- Done 2026-10-20: judge-written names for generic titles, flat-lay hero shots before cutouts (brand stores only),
  brand suggestions in Settings, login rate limiting.
- Done 2026-10-21, from a silent-failure review: isolated worker jobs with recorded failures, guards against
  empty or truncated catalog pulls wiping Shopify/Yoox, resale sources fail loudly when empty, feed and saved
  resale pieces re-checked (Grailed via its live index, Poshmark via its post endpoint, Vinted ages out after
  14 days), judge/embed/cutout handling for dead images and partial answers, a Needs-attention section in the
  alerts, stale and partial status on the site, versioned cutout URLs. Secondhand price ceilings (~40% of new).
- **Grailed blocks this Mac** for its shop page and listing API (403) since the evening of 2026-10-20; Algolia
  search still works with the key in config/sources.yaml. New Grailed pieces are stored without measurements
  while that lasts, and Settings shows it. Railway's IP may not be blocked.
- Not done from the review: eBay doesn't record skipped searches as a run (it rotates order instead).
- Vinted gives no measurements or shipping in search; consider a detail fetch only if it stays reliable.
- Rebuy shelf and home-goods discovery (PLAN.md "Beyond clothing") once clothing is settled.

## Ask Junaid

- Price ceilings marked "guess" in config/rules.yaml; Pinterest read in taste/profile.md; mood boards OK; site name.
