CREATE TABLE "event" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"event_type" text NOT NULL,
	"start" timestamp with time zone NOT NULL,
	"end" timestamp with time zone NOT NULL,
	"venue_id" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_team" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"team_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_details" (
	"event_id" text PRIMARY KEY NOT NULL,
	"opponent" text NOT NULL,
	"home_away" text NOT NULL,
	"competition" text NOT NULL,
	"meet_time" timestamp with time zone NOT NULL,
	"travel_meet_time" timestamp with time zone,
	"travel_meet_point" text
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "team_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_venue_id_location_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_team" ADD CONSTRAINT "event_team_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_team" ADD CONSTRAINT "event_team_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_details" ADD CONSTRAINT "match_details_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;