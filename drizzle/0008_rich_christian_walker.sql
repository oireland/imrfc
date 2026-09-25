ALTER TABLE "duty" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "duty" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kit_unit" ADD COLUMN "last_seen_event_id" text;