import type { z } from "zod";

export const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export class HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(`HTTP ${status} from ${url}: ${body.slice(0, 200)}`);
  }
}

type FetchJsonOptions = RequestInit & { timeoutMs?: number; retries?: number };

/**
 * GET/POST JSON with a timeout, one retry on 429/5xx, and schema validation.
 * Throws on anything unexpected: callers record the failure in source_runs.
 */
export async function fetchJson<T>(
  url: string,
  schema: z.ZodType<T>,
  { timeoutMs = 20_000, retries = 1, ...init }: FetchJsonOptions = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: { "user-agent": BROWSER_UA, accept: "application/json", ...init.headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new HttpError(url, res.status, text);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Expected JSON from ${url} but got: ${text.slice(0, 120)}`);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`Unexpected response shape from ${url}: ${parsed.error.message.slice(0, 400)}`);
    }
    return parsed.data;
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function toCents(value: string | number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Unparseable price: ${JSON.stringify(value)}`);
  return Math.round(n * 100);
}
