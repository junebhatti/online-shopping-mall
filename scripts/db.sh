#!/usr/bin/env bash
# Project-local Postgres for development. Data lives in .data/pg (gitignored).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
DATA="$ROOT/.data/pg"
PORT="${PGPORT_LOCAL:-54329}"
# Postgres on macOS refuses to start without a valid locale in the environment.
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

case "${1:-}" in
  start)
    if [ ! -d "$DATA" ]; then
      mkdir -p "$ROOT/.data"
      "$PG_BIN/initdb" -D "$DATA" -U mall --auth=trust --encoding=UTF8 --locale=en_US.UTF-8 >/dev/null
      echo "Initialized database cluster in .data/pg"
    fi
    if "$PG_BIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
      echo "Postgres already running on port $PORT"
    else
      "$PG_BIN/pg_ctl" -D "$DATA" -l "$ROOT/.data/pg.log" -w \
        -o "-p $PORT -c listen_addresses=localhost -c unix_socket_directories=''" start >/dev/null
      echo "Postgres started on port $PORT (log: .data/pg.log)"
    fi
    if ! "$PG_BIN/psql" -h localhost -p "$PORT" -U mall -d postgres -tAc "select 1 from pg_database where datname='mall'" | grep -q 1; then
      "$PG_BIN/createdb" -h localhost -p "$PORT" -U mall mall
      echo "Created database 'mall'"
    fi
    ;;
  stop)
    "$PG_BIN/pg_ctl" -D "$DATA" stop -m fast
    ;;
  psql)
    shift
    exec "$PG_BIN/psql" -h localhost -p "$PORT" -U mall mall "$@"
    ;;
  *)
    echo "usage: scripts/db.sh start|stop|psql" >&2
    exit 1
    ;;
esac
