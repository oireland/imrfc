DROP TABLE "team_sheet" CASCADE;--> statement-breakpoint
DROP TABLE "team_sheet_default" CASCADE;--> statement-breakpoint
ALTER TABLE "match_details" ADD COLUMN "schedule" text;--> statement-breakpoint
ALTER TABLE "match_details" ADD COLUMN "travel_attire" text;--> statement-breakpoint
ALTER TABLE "match_details" ADD COLUMN "warm_up_attire" text;--> statement-breakpoint
ALTER TABLE "match_details" ADD COLUMN "post_match_activity" text;