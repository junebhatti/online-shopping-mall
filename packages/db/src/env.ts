import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z
    .string({ error: "DATABASE_URL is not set. Copy .env.example to .env.local at the repo root." })
    .url("DATABASE_URL must be a postgres:// URL"),
});

export function databaseUrl(): string {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid database env: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  return parsed.data.DATABASE_URL;
}
