-- Quantity & split Whereabouts: Kit Units gain a Quantity (default 1) and their
-- Whereabouts moves from four columns on kit_unit to one-or-more rows in a new
-- kit_portion table, each a count at exactly one Place. Hand-written (not drizzle-kit's
-- drop-and-recreate) so existing Kit Units keep their Whereabouts as one Portion.

-- 1. Quantity, defaulting to 1 for every existing Kit Unit.
ALTER TABLE "kit_unit" ADD COLUMN "quantity" integer DEFAULT 1 NOT NULL;--> statement-breakpoint

-- 2. The new Portions table.
CREATE TABLE "kit_portion" (
	"id" text PRIMARY KEY NOT NULL,
	"kit_unit_id" text NOT NULL,
	"count" integer NOT NULL,
	"whereabouts_type" text NOT NULL,
	"store_id" text,
	"holder_id" text
	,"last_seen_event_id" text
);--> statement-breakpoint
ALTER TABLE "kit_portion" ADD CONSTRAINT "kit_portion_kit_unit_id_kit_unit_id_fk" FOREIGN KEY ("kit_unit_id") REFERENCES "public"."kit_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_portion" ADD CONSTRAINT "kit_portion_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_portion" ADD CONSTRAINT "kit_portion_holder_id_user_id_fk" FOREIGN KEY ("holder_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- 3. Every existing Kit Unit gets one Portion, carrying its whole Quantity (1) and copying
-- its current Whereabouts across.
INSERT INTO "kit_portion" ("id", "kit_unit_id", "count", "whereabouts_type", "store_id", "holder_id", "last_seen_event_id")
SELECT gen_random_uuid()::text, "id", "quantity", "whereabouts_type", "store_id", "holder_id", "last_seen_event_id"
FROM "kit_unit";--> statement-breakpoint

-- 4. Drop the old Whereabouts columns from kit_unit; Portions are now the only record of it.
ALTER TABLE "kit_unit" DROP CONSTRAINT "kit_unit_store_id_store_id_fk";--> statement-breakpoint
ALTER TABLE "kit_unit" DROP CONSTRAINT "kit_unit_holder_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "kit_unit" DROP COLUMN "whereabouts_type";--> statement-breakpoint
ALTER TABLE "kit_unit" DROP COLUMN "store_id";--> statement-breakpoint
ALTER TABLE "kit_unit" DROP COLUMN "holder_id";--> statement-breakpoint
ALTER TABLE "kit_unit" DROP COLUMN "last_seen_event_id";--> statement-breakpoint

-- 5. Movement Log entries gain a count and a from-place (for existing entries, which were
-- always whole-unit Moves, the count is 1; the from-place is left unknown — it wasn't kept).
ALTER TABLE "movement_log_entry" ADD COLUMN "count" integer;--> statement-breakpoint
ALTER TABLE "movement_log_entry" ADD COLUMN "from_type" text;--> statement-breakpoint
ALTER TABLE "movement_log_entry" ADD COLUMN "from_store_id" text;--> statement-breakpoint
ALTER TABLE "movement_log_entry" ADD COLUMN "from_holder_id" text;--> statement-breakpoint
ALTER TABLE "movement_log_entry" ADD CONSTRAINT "movement_log_entry_from_store_id_store_id_fk" FOREIGN KEY ("from_store_id") REFERENCES "public"."store"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_log_entry" ADD CONSTRAINT "movement_log_entry_from_holder_id_user_id_fk" FOREIGN KEY ("from_holder_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE "movement_log_entry" SET "count" = 1 WHERE "kind" = 'move';
