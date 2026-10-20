import { describe, expect, it } from "vitest";
import { loadRules, type BrandConfig } from "@mall/config";
import { bottomMatch, gate, hasUnnegatedWord, shoeMatch, topMatch, type GateInput } from "./gate.ts";

const rules = loadRules();
const base: GateInput = {
  source: "ebay",
  title: "Vintage Woolrich Long Sleeve Tee",
  brand: "Woolrich",
  category: "long_sleeve",
  department: "clothing",
  priceCents: 1800,
  retailCents: null,
  isUsed: true,
  condition: "excellent",
  attributes: { sizes: [{ label: "M", available: true }] },
};

describe("size matching", () => {
  it("matches tops", () => {
    expect(topMatch("M", rules.sizes.tops)).toBe(true);
    expect(topMatch("Medium", rules.sizes.tops)).toBe(true);
    expect(topMatch("M / Black", rules.sizes.tops)).toBe(true);
    expect(topMatch("XL", rules.sizes.tops)).toBe(false);
    expect(topMatch("XM", rules.sizes.tops)).toBe(false);
  });
  it("matches waist and inseam", () => {
    expect(bottomMatch("32", rules.sizes)).toBe(true);
    expect(bottomMatch("32x30", rules.sizes)).toBe(true);
    expect(bottomMatch("W32 L32", rules.sizes)).toBe(true);
    expect(bottomMatch("32 / 34", rules.sizes)).toBe(false);
    expect(bottomMatch("30x30", rules.sizes)).toBe(false);
    expect(bottomMatch("33", rules.sizes)).toBe(false);
  });
  it("matches shoes", () => {
    expect(shoeMatch("10", 10)).toBe(true);
    expect(shoeMatch("US 10", 10)).toBe(true);
    expect(shoeMatch("10.5", 10)).toBe(false);
    expect(shoeMatch("EU 10", 10)).toBe(false);
  });
});

describe("damage words", () => {
  it("ignores negated mentions", () => {
    expect(hasUnnegatedWord("great condition, no stains or holes", "stains")).toBe(false);
    expect(hasUnnegatedWord("great condition, no stains or holes", "holes")).toBe(false);
    expect(hasUnnegatedWord("small stain on the cuff", "stain")).toBe(true);
    expect(hasUnnegatedWord("ripstop nylon", "rip")).toBe(false);
  });
  it("treats wear and tear as light wear", () => {
    expect(gate({ ...base, title: "Woolrich tee, normal wear and tear" }, rules, undefined).passed).toBe(true);
  });
});

describe("gate", () => {
  it("passes a clean vintage M", () => {
    expect(gate(base, rules, undefined)).toEqual({ passed: true, matchedSize: "M" });
  });
  it("rejects real damage and keeps light wear", () => {
    expect(gate({ ...base, title: "Woolrich tee, hole near hem" }, rules, undefined).passed).toBe(false);
    expect(gate({ ...base, title: "Woolrich tee, light wear, no holes" }, rules, undefined).passed).toBe(true);
  });
  it("uses measurements over the label on resale", () => {
    const big = { ...base, attributes: { ...base.attributes, measurements: { chestIn: 26 } } };
    expect(gate(big, rules, undefined)).toEqual({ passed: false, reason: 'chest 26" out of range' });
  });
  it("enforces ceilings, shipping, region and loud colors", () => {
    expect(gate({ ...base, category: "tee", priceCents: 9000 }, rules, undefined).passed).toBe(false);
    expect(gate({ ...base, attributes: { ...base.attributes, shippingCents: 2500 } }, rules, undefined).passed).toBe(false);
    expect(gate({ ...base, attributes: { ...base.attributes, sellerLocation: "GB" } }, rules, undefined).passed).toBe(false);
    expect(gate({ ...base, title: "Neon green windbreaker" }, rules, undefined).passed).toBe(false);
  });
  it("keeps Margiela Replica fragrance", () => {
    const frag: GateInput = {
      ...base,
      title: "Maison Margiela Replica Jazz Club EDT 100ml",
      category: "fragrance",
      department: "fragrance",
      priceCents: 9000,
      condition: "new",
      isUsed: false,
      attributes: {},
    };
    expect(gate(frag, rules, undefined).passed).toBe(true);
  });
  it("requires a men's label on mixed Shopify stores and sale for sale-only brands", () => {
    const alo: BrandConfig = { name: "Alo", kind: "new", department: "clothing", feed: "shopify", sale_only: true };
    const shop = { ...base, source: "shopify", isUsed: false, condition: "new", category: "tee" as const };
    expect(gate(shop, rules, alo)).toEqual({ passed: false, reason: "not labeled men's" });
    const mens = { ...shop, attributes: { ...shop.attributes, gender: "men" } };
    expect(gate(mens, rules, alo)).toEqual({ passed: false, reason: "brand is sale-only" });
    expect(gate({ ...mens, retailCents: 6000, priceCents: 4000 }, rules, alo).passed).toBe(true);
  });
});
