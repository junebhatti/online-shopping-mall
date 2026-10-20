"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="flex flex-col gap-s3">
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1 text-[12px] text-ink-muted">
        Password
        <input name="password" type="password" autoComplete="current-password" required className="input" />
      </label>
      {state.error ? <p className="m-0 text-[12px] italic text-accent-ink">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="btn btn-primary self-start">
        {pending ? "Checking…" : "Log in"}
      </button>
    </form>
  );
}
