import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Departments the mall knows about. Home and supplements come later (see PLAN.md). */
export type Department = "clothing" | "fragrance" | "essentials";

export type Category =
  | "tee"
  | "long_sleeve"
  | "shirt"
  | "knit"
  | "sweatshirt"
  | "outerwear"
  | "pants"
  | "denim"
  | "shorts"
  | "shoes"
  | "accessory"
  | "fragrance"
  | "underwear"
  | "other";

export type Condition = "new" | "like_new" | "excellent" | "good" | "fair" | "poor";

/** Gate = hard rules (size, condition, price, region, colour). Only passed listings get scored. */
export type GateState = "pending" | "passed" | "rejected";

export type Verdict = "wear" | "not" | "inspo";

/** Category-specific details live here so new departments need no new columns. */
export type ListingAttributes = {
  sizes?: { label: string; available: boolean }[];
  matchedSize?: string;
  measurements?: { lengthIn?: number; chestIn?: number; waistIn?: number; inseamIn?: number };
  colors?: string[];
  tags?: string[];
  productType?: string;
  decade?: string;
  volumeMl?: number;
  shippingCents?: number;
  sellerLocation?: string;
  description?: string;
};

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const listings = pgTable(
  "listings",
  {
    id: serial("id").primaryKey(),
    /** Adapter id, e.g. "shopify" or "ebay". */
    source: text("source").notNull(),
    /** Display name of where it is sold, e.g. "Pool House New York" or "eBay". */
    store: text("store").notNull(),
    externalId: text("external_id").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    brand: text("brand").notNull(),
    department: text("department").$type<Department>().notNull(),
    category: text("category").$type<Category>().notNull(),
    priceCents: integer("price_cents").notNull(),
    /** Original price when marked down (Shopify compare_at, eBay originalPrice). */
    retailCents: integer("retail_cents"),
    currency: text("currency").notNull().default("USD"),
    isUsed: boolean("is_used").notNull().default(false),
    condition: text("condition").$type<Condition>(),
    images: text("images").array().notNull().default(sql`'{}'::text[]`),
    attributes: jsonb("attributes").$type<ListingAttributes>().notNull().default({}),
    status: text("status").$type<"active" | "sold" | "removed">().notNull().default("active"),

    gate: text("gate").$type<GateState>().notNull().default("pending"),
    gateReason: text("gate_reason"),
    embedding: real("embedding").array(),
    embeddingModel: text("embedding_model"),
    score: real("score"),
    judgeVerdict: text("judge_verdict").$type<"admit" | "skip">(),
    judgeFit: integer("judge_fit"),
    judgeNote: text("judge_note"),
    /** Short descriptive name from the judge, used when the store's title is generic ("Cotton jackets"). */
    displayName: text("display_name"),
    /** Which of `images` is the cleanest product shot (flat lay over on-model); cutouts use it. */
    heroImage: integer("hero_image"),
    admittedAt: timestamp("admitted_at", { withTimezone: true }),

    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("listings_source_external_idx").on(t.source, t.externalId),
    index("listings_admitted_idx").on(t.admittedAt),
    index("listings_gate_idx").on(t.gate, t.score),
  ],
);

/** One row per observed price. Written on first sight and on every change. */
export const pricePoints = pgTable(
  "price_points",
  {
    id: serial("id").primaryKey(),
    listingId: integer("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    priceCents: integer("price_cents").notNull(),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("price_points_listing_idx").on(t.listingId, t.seenAt)],
);

/** Background-removed product image, served by the web app at /img/:listingId. */
export const cutouts = pgTable("cutouts", {
  listingId: integer("listing_id")
    .primaryKey()
    .references(() => listings.id, { onDelete: "cascade" }),
  sourceUrl: text("source_url").notNull(),
  webp: bytea("webp").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  createdAt: createdAt(),
});

/** Would wear / would not wear / inspo. Latest rating per listing wins. */
export const ratings = pgTable(
  "ratings",
  {
    id: serial("id").primaryKey(),
    listingId: integer("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    verdict: text("verdict").$type<Verdict>().notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ratings_listing_idx").on(t.listingId)],
);

/** Saved = watched for price drops. Rebuy fields are for the future rebuy shelf. */
export const saves = pgTable(
  "saves",
  {
    id: serial("id").primaryKey(),
    listingId: integer("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    rebuyIntervalDays: integer("rebuy_interval_days"),
    lastBoughtAt: timestamp("last_bought_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("saves_listing_idx").on(t.listingId)],
);

/** A general item agents keep looking for across sources, e.g. a cologne on sale. */
export const watches = pgTable("watches", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  query: text("query").notNull(),
  department: text("department").$type<Department>().notNull(),
  maxPriceCents: integer("max_price_cents"),
  bestListingId: integer("best_listing_id").references(() => listings.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const pins = pgTable(
  "pins",
  {
    id: text("id").primaryKey(),
    boardSlug: text("board_slug").notNull(),
    boardName: text("board_name").notNull(),
    imageUrl: text("image_url").notNull(),
    width: integer("width"),
    height: integer("height"),
    link: text("link"),
    description: text("description"),
    dominantColor: text("dominant_color"),
    embedding: real("embedding").array(),
    embeddingModel: text("embedding_model"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pins_board_idx").on(t.boardSlug)],
);

/** Every adapter run, so failures are visible in Settings instead of silently empty feeds. */
export const sourceRuns = pgTable(
  "source_runs",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(),
    target: text("target"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").$type<"running" | "ok" | "error">().notNull().default("running"),
    fetched: integer("fetched").notNull().default(0),
    created: integer("created").notNull().default(0),
    updated: integer("updated").notNull().default(0),
    error: text("error"),
  },
  (t) => [index("source_runs_source_idx").on(t.source, t.startedAt)],
);

/** Failed owner logins, for rate limiting. Rows older than the window are deleted on each attempt. */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: serial("id").primaryKey(),
    ip: text("ip").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempts_ip_idx").on(t.ip, t.at)],
);
