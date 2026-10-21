import { db, loginAttempts, orm } from "@mall/db";
import { headers } from "next/headers";

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 10;

/** Client IP as Vercel reports it (first x-forwarded-for hop); "local" in dev. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

/** True when this IP has used up its failed attempts for the window. Prunes old rows as it goes. */
export async function loginBlocked(ip: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  await db().delete(loginAttempts).where(orm.lt(loginAttempts.at, since));
  const [row] = await db()
    .select({ n: orm.count() })
    .from(loginAttempts)
    .where(orm.and(orm.eq(loginAttempts.ip, ip), orm.gte(loginAttempts.at, since)));
  return (row?.n ?? 0) >= MAX_FAILURES;
}

export const recordFailedLogin = (ip: string) => db().insert(loginAttempts).values({ ip });

export const clearFailedLogins = (ip: string) => db().delete(loginAttempts).where(orm.eq(loginAttempts.ip, ip));
