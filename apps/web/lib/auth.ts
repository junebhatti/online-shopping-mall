import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Anyone can browse. The owner logs in with OWNER_PASSWORD to rate, save and change settings.
const COOKIE = "mall_owner";
const MAX_AGE_DAYS = 30;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set in .env.local (32+ characters)");
  return s;
}

const mac = (value: string) => createHmac("sha256", secret()).update(value).digest();

export const ownerLoginConfigured = () => Boolean(process.env.OWNER_PASSWORD);

export async function isOwner(): Promise<boolean> {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const expected = mac(exp).toString("base64url");
  return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export async function requireOwner(): Promise<void> {
  if (!(await isOwner())) throw new Error("Owner login required");
}

/** Constant-time comparison via HMAC so length differences don't leak. */
export function passwordMatches(input: string): boolean {
  const password = process.env.OWNER_PASSWORD;
  if (!password) return false;
  return timingSafeEqual(mac(`pw:${input}`), mac(`pw:${password}`));
}

export async function startOwnerSession(): Promise<void> {
  const exp = String(Date.now() + MAX_AGE_DAYS * 86_400_000);
  (await cookies()).set(COOKIE, `${exp}.${mac(exp).toString("base64url")}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_DAYS * 86_400,
  });
}

export async function endOwnerSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
