import { describe, expect, it } from "vitest";
import { brandMix } from "./mix.ts";

describe("brandMix", () => {
  it("never runs a brand more than twice when it can avoid it", () => {
    const items = ["A", "A", "A", "A", "B", "B", "C"].map((brand, i) => ({ brand, i }));
    const mixed = brandMix(items, (x) => x.brand).map((x) => x.brand).join("");
    expect(mixed).not.toMatch(/(.)\1\1/);
    expect(mixed).toHaveLength(7);
  });
  it("keeps order when brands already alternate", () => {
    const items = ["A", "B", "A", "B"].map((brand, i) => ({ brand, i }));
    expect(brandMix(items, (x) => x.brand).map((x) => x.i)).toEqual([0, 1, 2, 3]);
  });
});
