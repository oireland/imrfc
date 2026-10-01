CREATE TABLE "team_sheet" (
	"event_id" text PRIMARY KEY NOT NULL,
	"title" text,
	"kickoff" text,
	"meet" text,
	"location" text,
	"schedule" text,
	"travel_attire" text,
	"warm_up_attire" text,
	"post_match_activity" text,
	"message" text
);
--> statement-breakpoint
CREATE TABLE "team_sheet_default" (
	"team_id" text PRIMARY KEY NOT NULL,
	"travel_attire" text,
	"warm_up_attire" text,
	"post_match_activity" text,
	"message" text
);
--> statement-breakpoint
ALTER TABLE "selection_shirt" ADD COLUMN "roles" text[] DEFAULT '{}' NOT NULL;