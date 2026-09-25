CREATE TABLE "series" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"weekdays" integer[] NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"venue_id" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series_team" (
	"id" text PRIMARY KEY NOT NULL,
	"series_id" text NOT NULL,
	"team_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "series_id" text;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "edited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_venue_id_location_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_team" ADD CONSTRAINT "series_team_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_team" ADD CONSTRAINT "series_team_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE no action ON UPDATE no action;