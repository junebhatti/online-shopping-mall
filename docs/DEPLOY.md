# Deploying

Three pieces: a Postgres database (Neon), the site (Vercel), and the worker (Railway).
None of this has been run yet; the worker image has not been built locally because Docker isn't installed on the dev Mac.

## 1. Database: Neon

1. Create a project at neon.tech (free tier is enough to start; 0.5 GB).
2. Copy the pooled connection string. It looks like `postgres://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`.
3. Run migrations against it once from the repo root:

```bash
DATABASE_URL="<neon connection string>" npm run db:migrate
```

## 2. Worker: Railway

1. New project, deploy from the GitHub repo. `railway.json` points Railway at `worker.Dockerfile`.
2. Add a volume mounted at `/app/.cache` so the two image models (about 600 MB) download once.
3. Give the service at least 2 GB of RAM; CLIP and BiRefNet load together during a cycle.
4. Variables: `DATABASE_URL`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `ANTHROPIC_API_KEY`,
   `RESEND_API_KEY`, `ALERT_TO` (where sale alerts go), `SITE_URL` (the Vercel URL).
5. The container runs migrations, then the worker loop, which checks every 10 minutes for due jobs.

## 3. Site: Vercel

1. Import the GitHub repo. Set **Root Directory** to `apps/web`; Vercel detects Next.js and installs the workspace from the repo root.
2. Variables: `DATABASE_URL`, `AUTH_SECRET` (`openssl rand -hex 32`), `OWNER_PASSWORD`, `SITE_URL`.
3. After the first deploy, open `/settings` and check that brands and source status load. That confirms
   `config/` was shipped with the build (`outputFileTracingIncludes` in `apps/web/next.config.ts`;
   set `MALL_ROOT` if it can't find it).

## Costs to expect

Neon free, Vercel hobby free, Railway roughly $5–10 a month for a small always-on worker, Claude Haiku judging
about $1–2 a month, Resend free (alerts only send when a saved piece drops).
