CREATE TABLE "cutouts" (
	"listing_id" integer PRIMARY KEY NOT NULL,
	"source_url" text NOT NULL,
	"webp" "bytea" NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"store" text NOT NULL,
	"external_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"brand" text NOT NULL,
	"department" text NOT NULL,
	"category" text NOT NULL,
	"price_cents" integer NOT NULL,
	"retail_cents" integer,
	"currency" text DEFAULT 'USD' NOT NULL,
	"is_used" boolean DEFAULT false NOT NULL,
	"condition" text,
	"images" text[] DEFAULT '{}'::text[] NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"gate" text DEFAULT 'pending' NOT NULL,
	"gate_reason" text,
	"embedding" real[],
	"embedding_model" text,
	"score" real,
	"judge_note" text,
	"admitted_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pins" (
	"id" text PRIMARY KEY NOT NULL,
	"board_slug" text NOT NULL,
	"board_name" text NOT NULL,
	"image_url" text NOT NULL,
	"width" integer,
	"height" integer,
	"link" text,
	"description" text,
	"dominant_color" text,
	"embedding" real[],
	"embedding_model" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"listing_id" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"listing_id" integer NOT NULL,
	"verdict" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saves" (
	"id" serial PRIMARY KEY NOT NULL,
	"listing_id" integer NOT NULL,
	"rebuy_interval_days" integer,
	"last_bought_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"target" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"fetched" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "watches" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"query" text NOT NULL,
	"department" text NOT NULL,
	"max_price_cents" integer,
	"best_listing_id" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cutouts" ADD CONSTRAINT "cutouts_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_points" ADD CONSTRAINT "price_points_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saves" ADD CONSTRAINT "saves_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watches" ADD CONSTRAINT "watches_best_listing_id_listings_id_fk" FOREIGN KEY ("best_listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "listings_source_external_idx" ON "listings" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "listings_admitted_idx" ON "listings" USING btree ("admitted_at");--> statement-breakpoint
CREATE INDEX "listings_gate_idx" ON "listings" USING btree ("gate","score");--> statement-breakpoint
CREATE INDEX "pins_board_idx" ON "pins" USING btree ("board_slug");--> statement-breakpoint
CREATE INDEX "price_points_listing_idx" ON "price_points" USING btree ("listing_id","seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ratings_listing_idx" ON "ratings" USING btree ("listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saves_listing_idx" ON "saves" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "source_runs_source_idx" ON "source_runs" USING btree ("source","started_at");