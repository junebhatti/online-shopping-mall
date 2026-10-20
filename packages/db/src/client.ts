import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { databaseUrl } from "./env.ts";
import * as schema from "./schema.ts";

export type Db = ReturnType<typeof createDb>;

function createDb() {
  const client = postgres(databaseUrl(), { max: 5, idle_timeout: 20 });
  return drizzle(client, { schema });
}

// One pool per process. Next dev reloads modules, so keep it on globalThis.
const globalForDb = globalThis as unknown as { mallDb?: Db };

export function db(): Db {
  globalForDb.mallDb ??= createDb();
  return globalForDb.mallDb;
}
