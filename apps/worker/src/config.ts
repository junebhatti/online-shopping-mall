import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";
import type { Category, Department } from "@mall/db";

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

function loadYaml<T>(file: string, schema: z.ZodType<T>): T {
  const path = `${REPO_ROOT}${file}`;
  const parsed = schema.safeParse(parse(readFileSync(path, "utf8")));
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

export function priceCeilingCents(rules: Rules, category: Category): number {
  const usd = rules.price_ceilings_usd[category] ?? rules.price_ceilings_usd.other;
  if (usd === undefined) throw new Error(`config/rules.yaml has no price ceiling for "${category}" or "other"`);
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
  boards: z.record(z.string(), z.enum(["clothing", "home", "design", "ignore"])),
});

export const loadPinterest = () => loadYaml("config/pinterest.yaml", pinterestSchema);

export const readTasteProfile = () => readFileSync(`${REPO_ROOT}taste/profile.md`, "utf8");
