import type { Category, Condition, Department, ListingAttributes } from "@mall/db";

/** What every adapter produces. The worker turns these into `listings` rows. */
export type NormalizedListing = {
  source: string;
  store: string;
  externalId: string;
  url: string;
  title: string;
  brand: string;
  department: Department;
  category: Category;
  priceCents: number;
  retailCents: number | null;
  currency: string;
  isUsed: boolean;
  condition: Condition | null;
  images: string[];
  attributes: ListingAttributes & { gender?: "men" | "women" | "unisex" };
};
