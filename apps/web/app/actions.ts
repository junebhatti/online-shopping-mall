"use server";

import { db, orm, ratings, saves } from "@mall/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { endOwnerSession, ownerLoginConfigured, passwordMatches, requireOwner, startOwnerSession } from "@/lib/auth";

const listingId = z.number().int().positive();
const verdict = z.enum(["wear", "not", "inspo"]).nullable();

// The rating session is left alone so it doesn't reshuffle while you work through it.
function refresh() {
  for (const path of ["/", "/saved", "/inspiration"]) revalidatePath(path);
}

/** Set or clear the owner's rating. Ratings feed the scorer on the worker's next cycle. */
export async function rate(id: number, v: "wear" | "not" | "inspo" | null): Promise<void> {
  await requireOwner();
  const listing = listingId.parse(id);
  const value = verdict.parse(v);
  if (value === null) {
    await db().delete(ratings).where(orm.eq(ratings.listingId, listing));
  } else {
    await db()
      .insert(ratings)
      .values({ listingId: listing, verdict: value })
      .onConflictDoUpdate({ target: ratings.listingId, set: { verdict: value, updatedAt: new Date() } });
  }
  refresh();
}

/** Saved items are watched for price drops. */
export async function toggleSave(id: number): Promise<boolean> {
  await requireOwner();
  const listing = listingId.parse(id);
  const removed = await db().delete(saves).where(orm.eq(saves.listingId, listing)).returning({ id: saves.id });
  if (removed.length === 0) await db().insert(saves).values({ listingId: listing });
  refresh();
  return removed.length === 0;
}

export type LoginState = { error?: string };

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  if (!ownerLoginConfigured()) return { error: "Set OWNER_PASSWORD in .env.local first." };
  const password = z.string().min(1).max(200).safeParse(form.get("password"));
  if (!password.success || !passwordMatches(password.data)) return { error: "That password isn't right." };
  await startOwnerSession();
  const next = String(form.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout(): Promise<void> {
  await endOwnerSession();
  redirect("/");
}
