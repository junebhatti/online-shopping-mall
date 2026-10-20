import type { Category, ListingAttributes } from "@mall/db";
import { priceCeilingCents, type BrandConfig, type Rules } from "@mall/config";

export type GateInput = {
  source: string;
  title: string;
  brand: string;
  category: Category;
  department: "clothing" | "fragrance" | "essentials";
  priceCents: number;
  retailCents: number | null;
  isUsed: boolean;
  condition: string | null;
  attributes: ListingAttributes & { gender?: string };
};

export type GateResult = { passed: true; matchedSize?: string } | { passed: false; reason: string };

const TOPS: Category[] = ["tee", "long_sleeve", "shirt", "knit", "sweatshirt", "outerwear", "underwear"];
const BOTTOMS: Category[] = ["pants", "denim", "shorts"];

const fail = (reason: string): GateResult => ({ passed: false, reason });

export function gate(l: GateInput, rules: Rules, brand: BrandConfig | undefined): GateResult {
  const text = `${l.title} ${l.attributes.description ?? ""}`.toLowerCase();

  if (l.department !== "fragrance") {
    if (l.attributes.gender === "women") return fail("womenswear");
    const needsMensLabel = brand?.feed === "shopify" && !brand.menswear_only;
    if (needsMensLabel && !l.attributes.gender) return fail("not labeled men's");
  }
  if (l.category === "other") return fail("unknown category");
  const skip = rules.skip_items.find((w) => hasWord(l.title, w));
  if (skip) return fail(`skipped item: ${skip}`);

  if (l.priceCents > priceCeilingCents(rules, l.category)) return fail(`over ${l.category} ceiling`);
  if (brand?.sale_only && !l.retailCents) return fail("brand is sale-only");

  const loud = rules.loud_colors.find((c) => hasWord(`${text} ${(l.attributes.colors ?? []).join(" ")}`, c));
  if (loud) return fail(`loud color: ${loud}`);

  if (l.isUsed || l.source !== "shopify") {
    const resale = checkResale(l, text, rules);
    if (resale) return resale;
  }

  if (l.department === "fragrance") return { passed: true };
  return checkSize(l, rules);
}

function checkResale(l: GateInput, text: string, rules: Rules): GateResult | null {
  const r = rules.resale;
  if (l.attributes.sellerLocation && l.attributes.sellerLocation !== "US") return fail("ships from outside the US");
  if ((l.attributes.shippingCents ?? 0) > r.max_shipping_usd * 100) return fail("shipping too high");
  if (l.condition && r.reject_conditions.includes(l.condition)) return fail(`condition: ${l.condition}`);
  // "normal wear and tear" is light wear, not a tear.
  const damageText = text.replace(/wear\s*(and|&)\s*tear/g, "wear");
  const damage = r.damage_words.find((w) => hasUnnegatedWord(damageText, w));
  if (damage) return fail(`damage: ${damage}`);
  const fake = r.replica_words.find((w) => text.includes(w.toLowerCase()));
  if (fake) return fail(`fake signal: ${fake}`);
  return null;
}

function checkSize(l: GateInput, rules: Rules): GateResult {
  const s = rules.sizes;
  const sizes = (l.attributes.sizes ?? []).filter((x) => x.available);
  const labels = sizes.map((x) => x.label);
  const m = l.attributes.measurements ?? {};

  if (l.category === "accessory") {
    const hit = labels.find((x) => /one size|^os$|o\/s|onesize/i.test(x) || topMatch(x, s.tops));
    return labels.length === 0 || hit ? { passed: true, matchedSize: hit } : fail("size not available");
  }

  if (l.category === "shoes") {
    const hit = labels.find((x) => shoeMatch(x, s.shoe));
    return hit ? { passed: true, matchedSize: hit } : fail("shoe size not available");
  }

  if (BOTTOMS.includes(l.category)) {
    const hit = labels.find((x) => bottomMatch(x, s) || topMatch(x, s.tops));
    if (hit) return { passed: true, matchedSize: hit };
    if (m.waistIn && Math.abs(m.waistIn - s.waist) <= 1) return { passed: true, matchedSize: `${m.waistIn}" waist` };
    return fail("waist not available");
  }

  if (TOPS.includes(l.category)) {
    const [lenMin, lenMax] = s.top_measurements.length_in;
    const [chMin, chMax] = s.top_measurements.chest_in;
    // Measurements beat labels on resale: a vintage M can fit like a modern L.
    if (l.isUsed && m.chestIn && (m.chestIn < chMin || m.chestIn > chMax)) return fail(`chest ${m.chestIn}" out of range`);
    if (l.isUsed && m.lengthIn && (m.lengthIn < lenMin || m.lengthIn > lenMax)) return fail(`length ${m.lengthIn}" out of range`);
    const hit = labels.find((x) => topMatch(x, s.tops));
    if (hit) return { passed: true, matchedSize: hit };
    if (l.isUsed && m.chestIn) return { passed: true, matchedSize: `${m.chestIn}" chest` };
    return fail("size M not available");
  }

  return fail("no size rule for category");
}

const tokens = (label: string) => label.toUpperCase().split(/[\s/,|()-]+/).filter(Boolean);

export function topMatch(label: string, tops: string[]): boolean {
  const want = new Set(tops.map((t) => t.toUpperCase()).concat(["MD", "MED"]));
  const t = tokens(label.replace(/\bmen'?s\b/gi, ""));
  // "M" alone or as its own token; not "XM" and not ranges like "S-M" written as one token.
  return t.some((x) => want.has(x));
}

export function bottomMatch(label: string, s: Rules["sizes"]): boolean {
  const u = label.toUpperCase().replace(/\s+/g, " ");
  const pair = u.match(/W?\s?(\d{2})\s?(?:X|\/|L|\s)\s?L?(\d{2})\b/);
  if (pair?.[1] && pair[2]) {
    const waist = Number(pair[1]);
    const inseam = Number(pair[2]);
    return waist === s.waist && inseam >= s.inseam.min && inseam <= s.inseam.max;
  }
  const single = u.match(/^W?\s?(\d{2})$/) ?? u.match(/\bW(\d{2})\b/);
  return single?.[1] ? Number(single[1]) === s.waist : false;
}

export function shoeMatch(label: string, shoe: number): boolean {
  const nums = label.toUpperCase().match(/\d+(?:\.\d)?/g) ?? [];
  if (/\bEU\b|\bUK\b/.test(label.toUpperCase())) return false;
  return nums.some((n) => Number(n) === shoe);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const hasWord = (text: string, word: string) =>
  new RegExp(`(^|[^a-z])${escape(word.toLowerCase())}($|[^a-z])`).test(text.toLowerCase());

/** "stain" counts, "no stains or holes" does not. */
export function hasUnnegatedWord(text: string, word: string): boolean {
  const re = new RegExp(`(^|[^a-z])${escape(word.toLowerCase())}($|[^a-z])`, "g");
  for (const m of text.toLowerCase().matchAll(re)) {
    const before = text.toLowerCase().slice(Math.max(0, m.index - 30), m.index);
    if (!/\b(no|without|free of|zero|not any|never|minimal|any)\b[^.!;]*$/.test(before)) return true;
  }
  return false;
}
