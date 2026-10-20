import { describe, expect, it } from "vitest";
import { mapPoshmark, type PoshmarkPost } from "./poshmark.ts";
import { mapVinted, type VintedItem } from "./vinted.ts";

// Shapes from live probes on 2026-10-20.
describe("mapPoshmark", () => {
  const post: PoshmarkPost = {
    id: "6ad7c3558974d09fc975bcec",
    title: "Ralph Lauren Vintage Plaid Wool Pleated Pants",
    description: "Great shape. Waist 32 inseam 30",
    brand: "Ralph Lauren",
    price_amount: { val: "45.0", currency_code: "USD" },
    first_user_price_amount: { val: "60.0", currency_code: "USD" },
    size: "32",
    condition: "uln",
    department: { display: "Men" },
    category_v2: { display: "Pants" },
    picture_url: "https://di2ponv0v5otw.cloudfront.net/posts/a/m_1.jpg",
    inventory: { status: "available" },
  };
  it("maps size, condition, measurements and a real price drop", () => {
    expect(mapPoshmark(post)).toMatchObject({
      source: "poshmark",
      category: "pants",
      priceCents: 4500,
      retailCents: 6000,
      condition: "like_new",
      attributes: { sizes: [{ label: "32", available: true }], measurements: { waistIn: 32, inseamIn: 30 }, gender: "men" },
    });
  });
});

describe("mapVinted", () => {
  const item: VintedItem = {
    id: 10460258187,
    title: "Vintage Polo Ralph Lauren Khaki Pleated Trousers",
    url: "/items/10460258187-vintage-polo-ralph-lauren-khaki-pleated-trousers",
    price: { amount: "25.00", currency_code: "USD" },
    item_box: { first_line: "Polo Ralph Lauren", second_line: "W32 · Very good" },
    photo: { url: "https://images1.vinted.net/t/a/f800/1.webp" },
  };
  it("splits size and condition from the second line", () => {
    expect(mapVinted(item)).toMatchObject({
      source: "vinted",
      brand: "Polo Ralph Lauren",
      category: "pants",
      priceCents: 2500,
      condition: "excellent",
      url: "https://www.vinted.com/items/10460258187-vintage-polo-ralph-lauren-khaki-pleated-trousers",
      attributes: { sizes: [{ label: "W32", available: true }] },
    });
  });
});
