import type { Category, Department } from "@mall/db";

// Order matters: the first matching rule wins. Brand words are stripped first so
// "Polo Ralph Lauren Oxford" is a shirt, not a polo, and "Stone Island" isn't stone.
const BRAND_NOISE = /\b(polo ralph lauren|polo by ralph lauren|polo sport|ralph lauren polo)\b/gi;

// Every garment word accepts a plural: retailers like Yoox name categories "Shirts", "Sweaters".
const RULES: [Category, RegExp][] = [
  ["fragrance", /\b(eau de|parfum|cologne|edp|edt|fragrance|extrait)\b/],
  ["underwear", /\b(boxers?|briefs?|trunks?|underwear)\b/],
  ["shoes", /\b(loafers?|sneakers?|shoes?|boots?|runners?|trainers?|derby|derbies|mules?|sandals?|clogs?|espadrilles?|slip[- ]ons?)\b/],
  [
    "accessory",
    /\b(hats?|caps?|beanies?|bags?|totes?|backpacks?|scarf|scarves|belts?|socks?|gloves?|wallets?|bucket hats?|duffles?|pouch(es)?|bracelets?|cufflinks?|ties?|cases?)\b/,
  ],
  ["pants", /\b(sweatpants?|joggers?|track ?pants?|overalls?)\b/],
  ["shorts", /\b(shorts?|bermudas?)\b(?![- ]sleeve)/],
  ["knit", /\b(sweaters?|knit|cashmere|merino)\b[^,|]*\bvests?\b|\bsweater vests?\b/],
  // Clear outerwear words beat everything below; "fleece" alone does not (a fleece hoodie is a sweatshirt).
  [
    "outerwear",
    /\b(jackets?|coats?|parkas?|trench(es)?|overcoats?|topcoats?|blazers?|sport coats?|bombers?|anoraks?|shells?|gilets?|vests?|puffers?|outerwear|suits?)\b/,
  ],
  ["sweatshirt", /\b(sweatshirts?|hoodies?|crewneck sweat|pullover sweat|quarter zip|1\/4 zip|half zip)\b/],
  ["outerwear", /\b(overshirts?|shirt jackets?|shackets?|fleece|chore)\b/],
  ["knit", /\b(sweaters?|cardigans?|knit|knitwear|jumpers?|cashmere|merino|lambswool|pullovers?|turtlenecks?)\b/],
  ["long_sleeve", /\b(long ?sleeves?|l\/s|henleys?|thermals?|waffle)\b/],
  ["tee", /\b(t-?shirts?|tees?|tanks?|ringers?)\b/],
  ["shirt", /\b(shirts?|oxfords?|ocbd|flannels?|button[- ]?downs?|button[- ]?ups?|camp collar)\b/],
  ["denim", /\b(jeans?|denim|selvedge|501|505)\b/],
  ["pants", /\b(pants?|trousers?|chinos?|slacks|khakis?|cargos?|carpenter|fatigues?)\b/],
  ["tee", /\bpolos?\b/],
];

export function categorize(text: string, department: Department): Category {
  if (department === "fragrance") return "fragrance";
  if (department === "essentials") return /\b(socks?)\b/i.test(text) ? "accessory" : "underwear";
  const t = text.toLowerCase().replace(BRAND_NOISE, " ");
  for (const [category, re] of RULES) if (re.test(t)) return category;
  return "other";
}

// Garments that are women's even when a store tags them "unisex" (LA Apparel tags nearly everything both ways).
const WOMEN_ONLY =
  /\b(panty|panties|bra|bralette|bikini|leggings?|dress|skirt|bodysuit|intimates?|high[- ]waist(ed)?|hot shorts?|camisole|cami|thong|blouse|maternity|boy shorts|tube top|halter)\b/;

export function detectGender(text: string): "men" | "women" | "unisex" | undefined {
  const t = text.toLowerCase();
  if (WOMEN_ONLY.test(t)) return "women";
  const women = /\b(women'?s?|womens|woman'?s|ladies|female|girls?)\b/.test(t);
  const men = /\b(men'?s?|mens|man'?s|male|boys?)\b/.test(t);
  if (/\bunisex\b/.test(t) || (women && men)) return "unisex";
  if (women) return "women";
  if (men) return "men";
  return undefined;
}
