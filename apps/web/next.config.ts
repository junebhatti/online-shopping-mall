import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

// Secrets live in .env.local at the repo root, shared with the worker.
const root = fileURLToPath(new URL("../../", import.meta.url));
// forceReload: Next already loaded (empty) env files from apps/web and caches that result.
loadEnvConfig(root, process.env.NODE_ENV !== "production", undefined, true);

const config: NextConfig = {
  transpilePackages: ["@mall/db", "@mall/config", "@mall/sources", "@mall/alerts"],
  outputFileTracingRoot: root,
  // Settings reads the YAML config and taste profile at request time.
  outputFileTracingIncludes: { "/**": ["../../config/**/*", "../../taste/**/*"] },
};

export default config;
