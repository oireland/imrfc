ALTER TABLE "user" ADD COLUMN "other_positions" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "playing" boolean DEFAULT true NOT NULL;