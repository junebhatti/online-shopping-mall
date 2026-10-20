import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL ?? "postgres://mall@localhost:54329/mall";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: { url },
});
