#!/usr/bin/env bash
# Copy the local database (schema, migrations table and data) into an empty Neon database,
# so the deployed site starts with the current feed. Reads NEON_DATABASE_URL from .env.local.
# Refuses to run if the target already has tables.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
TARGET="$(grep -E '^NEON_DATABASE_URL=' "$ROOT/.env.local" | head -1 | cut -d= -f2-)"
if [ -z "$TARGET" ]; then
  echo "NEON_DATABASE_URL is empty in .env.local" >&2
  exit 1
fi
# The non-pooled endpoint handles a restore; the pooled one may not.
DIRECT="${TARGET/-pooler./.}"

TABLES="$("$PG_BIN/psql" "$DIRECT" -tAc "select count(*) from information_schema.tables where table_schema in ('public','drizzle')")"
if [ "$TABLES" != "0" ]; then
  echo "Target already has $TABLES tables; not overwriting. Use an empty Neon database." >&2
  exit 1
fi

DUMP="$ROOT/.data/neon-copy.dump"
"$PG_BIN/pg_dump" -h localhost -p 54329 -U mall -d mall --format=custom --no-owner --no-acl -f "$DUMP"
"$PG_BIN/pg_restore" --no-owner --no-acl --dbname="$DIRECT" "$DUMP"
rm -f "$DUMP"
echo "Copied. Row counts in Neon:"
"$PG_BIN/psql" "$DIRECT" -c "select (select count(*) from listings) listings, (select count(*) from listings where admitted_at is not null) in_feed, (select count(*) from cutouts) cutouts, (select count(*) from pins) pins"
