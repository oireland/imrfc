CREATE TABLE "kit_unit" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"home_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"condition_note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kit_unit" ADD CONSTRAINT "kit_unit_home_id_location_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;