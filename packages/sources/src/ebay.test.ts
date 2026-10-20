import { describe, expect, it } from "vitest";
import { mapEbayItem, parseMeasurements, type EbayItem } from "./ebay.ts";

// Shape follows the Browse API getItem response (developer.ebay.com/api-docs/buy/browse/resources/item/methods/getItem).
const item: EbayItem = {
  itemId: "v1|1234567890|0",
  title: "Vintage 90s Woolrich Flannel Button Down Shirt Mens Medium Blue Plaid",
  itemWebUrl: "https://www.ebay.com/itm/1234567890",
  price: { value: "24.99", currency: "USD" },
  marketingPrice: { originalPrice: { value: "34.99", currency: "USD" } },
  condition: "Pre-owned",
  conditionId: "3000",
  image: { imageUrl: "https://i.ebayimg.com/images/g/abc/s-l1600.jpg" },
  additionalImages: [{ imageUrl: "https://i.ebayimg.com/images/g/def/s-l1600.jpg" }],
  shippingOptions: [{ shippingCostType: "FIXED", shippingCost: { value: "6.50", currency: "USD" } }],
  itemLocation: { country: "US", postalCode: "100**" },
  brand: "Woolrich",
  description: "<p>Great condition, no stains or holes.</p><p>Pit to pit: 22.5 in<br>Length: 27\"</p>",
  localizedAspects: [
    { name: "Brand", value: "Woolrich" },
    { name: "Size", value: "M" },
    { name: "Department", value: "Men" },
    { name: "Color", value: "Blue" },
    { name: "Decade", value: "1990s" },
  ],
};

describe("mapEbayItem", () => {
  it("maps a used shirt with size, measurements, shipping and markdown", () => {
    const l = mapEbayItem(item, "clothing");
    expect(l).toMatchObject({
      source: "ebay",
      externalId: "v1|1234567890|0",
      brand: "Woolrich",
      category: "shirt",
      priceCents: 2499,
      retailCents: 3499,
      isUsed: true,
      condition: "good",
      attributes: {
        sizes: [{ label: "M", available: true }],
        measurements: { chestIn: 22.5, lengthIn: 27 },
        shippingCents: 650,
        sellerLocation: "US",
        gender: "men",
        decade: "1990s",
      },
    });
    expect(l?.images).toHaveLength(2);
  });

  it("skips non-USD prices", () => {
    expect(mapEbayItem({ ...item, price: { value: "20", currency: "GBP" } }, "clothing")).toBeNull();
  });
});

describe("parseMeasurements", () => {
  it("reads common seller formats", () => {
    expect(parseMeasurements("P2P 23 / length 28 in")).toEqual({ chestIn: 23, lengthIn: 28 });
    expect(parseMeasurements("Waist: 32 Inseam: 30")).toEqual({ waistIn: 32, inseamIn: 30 });
    expect(parseMeasurements("Length 2 sizes up")).toEqual({});
  });
});
