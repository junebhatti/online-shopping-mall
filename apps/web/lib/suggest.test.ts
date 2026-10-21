import { describe, expect, it } from "vitest";
import { isKnown, normalizeBrand } from "./suggest.ts";

describe("normalizeBrand", () => {
  it("folds retailer spellings of the same label together", () => {
    expect(normalizeBrand("Polo by Ralph Lauren")).toBe("ralph lauren");
    expect(normalizeBrand("Vintage Woolrich")).toBe("woolrich");
    expect(normalizeBrand("Arc'teryx")).toBe("arc teryx");
    expect(normalizeBrand("ARC'TERYX")).toBe(normalizeBrand("Arc’teryx"));
  });
});

describe("isKnown", () => {
  const known = new Set(["woolrich", "carhartt", "acne studios"]);
  it("treats sub-labels as the followed brand", () => {
    expect(isKnown("woolrich woolen mills", known)).toBe(true);
    expect(isKnown("carhartt wip", known)).toBe(true);
    expect(isKnown("acne", known)).toBe(false);
    expect(isKnown("peter millar", known)).toBe(false);
  });
});
