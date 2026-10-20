import type { Category, Department } from "@mall/db";

// Order matters: the first matching rule wins. Brand words are stripped first so
// "Polo Ralph Lauren Oxford" is a shirt, not a polo, and "Stone Island" isn't stone.
const BRAND_NOISE = /\b(polo ralph lauren|polo by ralph lauren|polo sport|ralph lauren polo)\b/gi;

const RULES: [Category, RegExp][] = [
  ["fragrance", /\b(eau de|parfum|cologne|edp|edt|fragrance|extrait)\b/],
  ["underwear", /\b(boxer|boxers|brief|briefs|trunks?|underwear)\b/],
  ["shoes", /\b(loafers?|sneakers?|shoes?|boots?|runners?|trainers?|derby|derbies|mules?|sandals?|clogs?)\b/],
  ["accessory", /\b(hat|cap|beanie|bag|tote|backpack|scarf|belt|socks?|gloves?|wallet|bucket hat)\b/],
  ["pants", /\b(sweatpants?|joggers?|track ?pants?)\b/],
  [
    "outerwear",
    /\b(jacket|coat|parka|trench|overcoat|topcoat|overshirt|shirt jacket|shacket|fleece|vest|gilet|anorak|shell|blazer|sport coat|bomber|chore)\b/,
  ],
  ["sweatshirt", /\b(sweatshirt|hoodie|hooded|crewneck sweat|pullover sweat|quarter zip|1\/4 zip|half zip)\b/],
  ["knit", /\b(sweater|cardigan|knit|jumper|cashmere|merino|lambswool|pullover)\b/],
  ["long_sleeve", /\b(long ?sleeve|l\/s|henley|thermal|waffle)\b/],
  ["tee", /\b(t-?shirt|tee|tank|ringer)\b/],
  ["shirt", /\b(shirt|oxford|ocbd|flannel|button[- ]?down|button[- ]?up|camp collar|overshirt)\b/],
  ["shorts", /\bshorts\b/],
  ["denim", /\b(jeans?|denim|selvedge|501|505)\b/],
  ["pants", /\b(pants?|trousers?|chinos?|slacks|khakis?|cargos?|carpenter|fatigues?)\b/],
  ["tee", /\bpolo\b/],
];

export function categorize(text: string, department: Department): Category {
  if (department === "fragrance") return "fragrance";
  if (department === "essentials") return /\b(socks?)\b/i.test(text) ? "accessory" : "underwear";
  const t = text.toLowerCase().replace(BRAND_NOISE, " ");
  for (const [category, re] of RULES) if (re.test(t)) return category;
  return "other";
}

export function detectGender(text: string): "men" | "women" | "unisex" | undefined {
  const t = text.toLowerCase();
  const women = /\b(women'?s?|womens|woman'?s|ladies|female|girls?)\b/.test(t);
  const men = /\b(men'?s?|mens|man'?s|male|boys?)\b/.test(t);
  if (/\bunisex\b/.test(t) || (women && men)) return "unisex";
  if (women) return "women";
  if (men) return "men";
  return undefined;
}
