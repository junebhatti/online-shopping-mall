# Worker image (Railway, Fly, or any VPS). Build from the repo root:
#   docker build -f worker.Dockerfile -t mall-worker .
FROM node:22-bookworm-slim
WORKDIR /app

# Manifests first so dependency installs cache between deploys.
COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/digest/package.json packages/digest/
COPY packages/sources/package.json packages/sources/
RUN npm ci --workspace @mall/worker --include-workspace-root

COPY . .
ENV NODE_ENV=production
# Image models download into /app/.cache on first run; mount a volume there so they persist.
VOLUME ["/app/.cache"]
CMD ["sh", "-c", "npm run db:migrate && npm run worker"]
