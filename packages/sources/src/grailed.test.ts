import { describe, expect, it } from "vitest";
import { mapGrailed, type GrailedHit } from "./grailed.ts";

// Shapes from a live probe of the Algolia index and /api/listings/:id (2026-10-20).
const hit: GrailedHit = {
  id: 109340408,
  title: "Vintage 90s Polo Ralph Lauren Pleated Wool Trouser Pants",
  designer_names: "Ralph Lauren",
  price: 60,
  price_drops: [85, 60],
  size: "32",
  condition: "is_gently_used",
  department: "menswear",
  category_path: "bottoms.casual_pants",
  location: "United States",
  sold: false,
  cover_photo: { url: "https://media-assets.grailed.com/prd/listing/a" },
  shipping: { us: { amount: 10.99, enabled: true } },
};

describe("mapGrailed", () => {
  it("maps a search hit plus detail into a listing", () => {
    const l = mapGrailed(hit, {
      description: "Great condition",
      measurements: [
        { inches: 16, measurement_type_id: 6 },
        { inches: 30, measurement_type_id: 7 },
      ],
      photos: [{ url: "https://media-assets.grailed.com/prd/listing/a" }, { url: "https://media-assets.grailed.com/prd/listing/b" }],
    });
    expect(l).toMatchObject({
      source: "grailed",
      externalId: "109340408",
      brand: "Ralph Lauren",
      category: "pants",
      priceCents: 6000,
      retailCents: 8500,
      condition: "excellent",
      isUsed: true,
      attributes: {
        sizes: [{ label: "32", available: true }],
        measurements: { waistIn: 32, inseamIn: 30 },
        shippingCents: 1099,
        sellerLocation: "US",
        gender: "men",
      },
    });
    expect(l.images).toHaveLength(2);
  });
});
