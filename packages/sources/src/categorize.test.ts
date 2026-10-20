import { describe, expect, it } from "vitest";
import { categorize, detectGender } from "./categorize.ts";

const c = (t: string) => categorize(t, "clothing");

describe("categorize", () => {
  it.each([
    ["HFX409 - Heavy Fleece Wide Hoodie (Piece Dye)", "sweatshirt"],
    ["MWF499 - 10 oz. Mid-weight Fleece Club Jacket", "outerwear"],
    ["RFK313 - Cashmere Knit V-Neck Vest", "knit"],
    ["TX402GD - Heavy Thermal Garment Dye Shorts", "shorts"],
    ["1809GD - Short Sleeve Garment Dye Pocket T-Shirt", "tee"],
    ["1210GD - 8.5 oz. Heavy Jersey Long Sleeve Boxy Work Shirt", "long_sleeve"],
    ["Polo Ralph Lauren Oxford Shirt Blue", "shirt"],
    ["Vintage Polo Ralph Lauren Pleated Chino Pants", "pants"],
    ["Stone Island Overshirt", "outerwear"],
    ["Patagonia Synchilla Snap-T Fleece Pullover", "outerwear"],
    ["Latitude Light Weight 1/2 Zip Pullover Jacket - Black", "outerwear"],
    ["Acne Studios 2021M Jeans", "denim"],
    ["Denim Trucker Jacket", "outerwear"],
    ["Vintage Adidas Soccer Shorts", "shorts"],
    ["G.H. Bass Weejuns Penny Loafers", "shoes"],
    ["Knit Polo Shirt", "knit"],
    ["Cotton denim shirts", "shirt"],
    ["Wool sweaters", "knit"],
    ["Cotton sweatshirts", "sweatshirt"],
    ["Polyester puffers", "outerwear"],
    ["Wool turtlenecks", "knit"],
    ["Cotton shorts & bermuda shorts", "shorts"],
    ["Leather belts", "accessory"],
    ["Cotton denim outerwear", "outerwear"],
  ])("%s -> %s", (title, expected) => {
    expect(c(title)).toBe(expected);
  });
});

describe("detectGender", () => {
  it("treats women-only garments as women's even when tagged unisex", () => {
    expect(detectGender("Flex Fleece High Waist Sweatpant Unisex men women")).toBe("women");
    expect(detectGender("Cotton Spandex Jersey Hot Shorts unisex panties")).toBe("women");
    expect(detectGender("Heavy Fleece Crewneck Sweatshirt men mens unisex Women womens")).toBe("unisex");
    expect(detectGender("Men's Baby Rib Brief")).toBe("men");
  });
});
