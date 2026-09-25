-- Venues become free text on Events and Series; Locations become Stores only.
-- Hand-written (not drizzle-kit's drop-and-recreate) so no data is lost.

-- 1. Copy each Event's and Series' Venue name into a text column, then drop the link.
ALTER TABLE "event" ADD COLUMN "venue" text;--> statement-breakpoint
UPDATE "event" SET "venue" = "location"."name" FROM "location" WHERE "location"."id" = "event"."venue_id";--> statement-breakpoint
UPDATE "event" SET "venue" = '' WHERE "venue" IS NULL;--> statement-breakpoint
ALTER TABLE "event" ALTER COLUMN "venue" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "event" DROP CONSTRAINT "event_venue_id_location_id_fk";--> statement-breakpoint
ALTER TABLE "event" DROP COLUMN "venue_id";--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "venue" text;--> statement-breakpoint
UPDATE "series" SET "venue" = "location"."name" FROM "location" WHERE "location"."id" = "series"."venue_id";--> statement-breakpoint
UPDATE "series" SET "venue" = '' WHERE "venue" IS NULL;--> statement-breakpoint
ALTER TABLE "series" ALTER COLUMN "venue" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "series" DROP CONSTRAINT "series_venue_id_location_id_fk";--> statement-breakpoint
ALTER TABLE "series" DROP COLUMN "venue_id";--> statement-breakpoint

-- 2. Locations that were only Venues aren't Stores: archive them (never hard-delete).
UPDATE "location" SET "archived" = true WHERE "is_store" = false;--> statement-breakpoint
ALTER TABLE "location" DROP COLUMN "is_venue";--> statement-breakpoint
ALTER TABLE "location" DROP COLUMN "is_store";--> statement-breakpoint

-- 3. Rename location → store, keeping every row and foreign key; constraint names follow.
ALTER TABLE "location" RENAME TO "store";--> statement-breakpoint
ALTER TABLE "store" RENAME CONSTRAINT "location_pkey" TO "store_pkey";--> statement-breakpoint
ALTER TABLE "duty" RENAME CONSTRAINT "duty_destination_store_id_location_id_fk" TO "duty_destination_store_id_store_id_fk";--> statement-breakpoint
ALTER TABLE "kit_unit" RENAME CONSTRAINT "kit_unit_home_id_location_id_fk" TO "kit_unit_home_id_store_id_fk";--> statement-breakpoint
ALTER TABLE "kit_unit" RENAME CONSTRAINT "kit_unit_store_id_location_id_fk" TO "kit_unit_store_id_store_id_fk";--> statement-breakpoint
ALTER TABLE "movement_log_entry" RENAME CONSTRAINT "movement_log_entry_to_store_id_location_id_fk" TO "movement_log_entry_to_store_id_store_id_fk";
