import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { databaseUrl } from "./env.ts";
import * as schema from "./schema.ts";

export type Db = ReturnType<typeof createDb>;

function createDb() {
  const url = databaseUrl();
  // Neon's pooled endpoint runs PgBouncer in transaction mode, which doesn't keep prepared statements.
  const pooled = new URL(url).hostname.includes("-pooler");
  const client = postgres(url, { max: 5, idle_timeout: 20, prepare: !pooled });
  return drizzle(client, { schema });
}

// One pool per process. Next dev reloads modules, so keep it on globalThis.
const globalForDb = globalThis as unknown as { mallDb?: Db };

export function db(): Db {
  globalForDb.mallDb ??= createDb();
  return globalForDb.mallDb;
}
