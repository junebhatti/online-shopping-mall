# Next session

Read PLAN.md first (the Phases section has per-source status). Everything runs locally; nothing is deployed.

## State (2026-10-20, evening)

- Start: `npm run db:start`, then `npm run dev` (http://localhost:3100) and `npm run worker` for the loop.
  `npm run worker:once -- --only=<jobs>` runs chosen jobs: pinterest, shopify, yoox, ebay, grailed, poshmark,
  vinted, then watches, gate, embed, score, judge, admit, cutouts, and digest.
- Sources live: Shopify (LA Apparel, Alo, Pool House), Yoox men's sale, Grailed, Poshmark, Vinted, Pinterest.
  About 1,100 listings past the gate, 60 admitted to the feed (20 a day from here).
- eBay adapter is built and recorded as failing until keys exist. Claude judge likewise until `ANTHROPIC_API_KEY` is set.
- Digest builds daily after 8am and is saved in `.data/digests`; it emails once Resend is configured. Preview at /digest.
- Owner password: `OWNER_PASSWORD` in `.env.local` (a generated test value).
- `npm test` (44 tests), `npm run typecheck`, `npm run build` all clean.

## Waiting on Junaid

1. **eBay**: the developer account needs its email confirmed (nothing had arrived in the Gmail inbox; check spam or
   re-send from the page). Then: developer.ebay.com, Application Keys, create a production keyset, and handle the
   marketplace account deletion notice. The mall stores listing data only, no eBay user data, so the exemption applies;
   let Junaid confirm the wording. Put `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` in `.env.local`, then
   `npm run worker:once -- --only=ebay,gate,embed,score,admit,cutouts` and check categories 1059 / 93427 and size aspects.
2. **Claude key** in `.env.local` (`ANTHROPIC_API_KEY`), then `npm run worker:once -- --only=judge,admit`.
   Check the judge's verdicts on the item pages (owner sees the note).
3. **Resend** for the digest (`RESEND_API_KEY`, `DIGEST_TO`); `onboarding@resend.dev` can send to the signup address.
4. **Deploy** per docs/DEPLOY.md.

## Next to build

- Brand-list growth from ratings (suggest brands Junaid keeps rating "wear" that aren't in config/brands.yaml).
- Pick a flat-lay image over an on-model one when a store offers both, before cutting out.
- Owner login rate limiting.
- Vinted gives no measurements or shipping in search; consider a detail fetch only if it stays reliable.

## Ask Junaid

- Price ceilings marked "guess" in config/rules.yaml; Pinterest read in taste/profile.md; mood boards OK; site name.
