import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import type { Category, Department } from "@mall/db";

/**
 * The repo root holds config/ and taste/. Found by walking up from the working
 * directory, which works for the worker, `next dev`, and a traced Vercel build alike.
 */
function findRepoRoot(): string {
  if (process.env.MALL_ROOT) return process.env.MALL_ROOT.replace(/\/?$/, "/");
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    if (existsSync(/*turbopackIgnore: true*/ join(dir, "config", "brands.yaml"))) return `${dir}/`;
    if (dirname(dir) === dir) throw new Error(`config/brands.yaml not found above ${process.cwd()}; set MALL_ROOT`);
  }
}

export const REPO_ROOT = findRepoRoot();

function loadYaml<T>(file: string, schema: z.ZodType<T>): T {
  const path = `${REPO_ROOT}${file}`;
  // next.config.ts ships config/ and taste/ with the build, so the bundler needn't trace these reads.
  const parsed = schema.safeParse(parse(readFileSync(/*turbopackIgnore: true*/ path, "utf8")));
  if (!parsed.success) throw new Error(`Invalid ${file}: ${parsed.error.message}`);
  return parsed.data;
}

const brandSchema = z.object({
  name: z.string(),
  kind: z.enum(["new", "vintage"]),
  site: z.string().url().optional(),
  feed: z.literal("shopify").optional(),
  sale_only: z.boolean().optional(),
  menswear_only: z.boolean().optional(),
  aliases: z.array(z.string()).optional(),
  note: z.string().optional(),
});

const brandsFileSchema = z.object({
  clothing: z.array(brandSchema),
  clothing_candidates: z.array(brandSchema).optional(),
  vintage: z.array(brandSchema),
  fragrance: z.array(brandSchema),
  essentials: z.array(brandSchema),
});

export type BrandConfig = z.infer<typeof brandSchema> & { department: Department };

export function loadBrands(): BrandConfig[] {
  const f = loadYaml("config/brands.yaml", brandsFileSchema);
  const tag = (list: z.infer<typeof brandSchema>[], department: Department) => list.map((b) => ({ ...b, department }));
  return [
    ...tag(f.clothing, "clothing"),
    ...tag(f.vintage, "clothing"),
    ...tag(f.fragrance, "fragrance"),
    ...tag(f.essentials, "essentials"),
  ];
}

const range = z.tuple([z.number(), z.number()]);

const rulesSchema = z.object({
  sizes: z.object({
    tops: z.array(z.string()),
    waist: z.number(),
    inseam: z.object({ min: z.number(), max: z.number() }),
    shoe: z.number(),
    top_measurements: z.object({ length_in: range, chest_in: range }),
  }),
  price_ceilings_usd: z.record(z.string(), z.number()),
  resale_price_ceilings_usd: z.record(z.string(), z.number()),
  admission: z.object({ daily_limit: z.number(), rating_session_size: z.number() }),
  resale: z.object({
    max_shipping_usd: z.number(),
    reject_conditions: z.array(z.string()),
    damage_words: z.array(z.string()),
    replica_words: z.array(z.string()),
  }),
  skip_items: z.array(z.string()),
  loud_colors: z.array(z.string()),
});

export type Rules = z.infer<typeof rulesSchema>;

export const loadRules = () => loadYaml("config/rules.yaml", rulesSchema);

/** Marketplaces where pieces are secondhand (even new-with-tags ones), as opposed to brand stores and Yoox. */
export const RESALE_SOURCES = new Set(["grailed", "poshmark", "vinted", "ebay"]);

export function priceCeilingCents(rules: Rules, category: Category, resale = false): number {
  const table = resale ? rules.resale_price_ceilings_usd : rules.price_ceilings_usd;
  const usd = table[category] ?? table.other;
  const name = resale ? "resale_price_ceilings_usd" : "price_ceilings_usd";
  if (usd === undefined) throw new Error(`config/rules.yaml ${name} has no ceiling for "${category}" or "other"`);
  return usd * 100;
}

const queriesSchema = z.object({
  clothing: z.array(z.string()),
  shoes: z.array(z.string()),
  fragrance: z.array(z.string()),
});

export const loadQueries = () => loadYaml("config/queries.yaml", queriesSchema);

const pinterestSchema = z.object({
  username: z.string(),
  boards: z.record(z.string(), z.enum(["clothing", "mood", "home", "design", "ignore"])),
});

export const loadPinterest = () => loadYaml("config/pinterest.yaml", pinterestSchema);

const tasteSchema = z.object({
  want: z.array(z.string()).min(1),
  avoid: z.array(z.string()),
  weights: z.object({
    pins: z.number(),
    want: z.number(),
    avoid: z.number(),
    wear: z.number(),
    not: z.number(),
    inspo: z.number(),
  }),
  fragrance_favorites: z.array(z.string()),
  judge: z.object({
    model: z.string(),
    batch_size: z.number().int().positive(),
    min_fit: z.number().int().min(1).max(10),
    min_score_without_judge: z.number(),
  }),
  admission: z.object({ initial_backfill: z.number().int(), max_share_per_store: z.number().gt(0).lte(1) }),
});

export type TasteConfig = z.infer<typeof tasteSchema>;

export const loadTaste = () => loadYaml("config/taste.yaml", tasteSchema);

export const readTasteProfile = () => readFileSync(/*turbopackIgnore: true*/ `${REPO_ROOT}taste/profile.md`, "utf8");

const watchesSchema = z.array(
  z.object({
    label: z.string().min(1),
    query: z.string().min(1),
    department: z.enum(["clothing", "fragrance", "essentials"]),
    max_price_usd: z.number().positive().optional(),
  }),
);

export const loadWatches = () => loadYaml("config/watches.yaml", watchesSchema);

const sourcesSchema = z.object({
  grailed: z.object({ app_id: z.string(), search_key: z.string(), index: z.string(), live_index: z.string() }),
  yoox: z.object({ app_id: z.string(), search_key: z.string(), index: z.string(), department: z.string() }),
});

export type SourcesConfig = z.infer<typeof sourcesSchema>;

export const loadSources = () => loadYaml("config/sources.yaml", sourcesSchema);
