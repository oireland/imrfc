ALTER TABLE "event" ADD COLUMN "start_tbc" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "match_details" ALTER COLUMN "meet_time" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "match_details" ADD COLUMN "team_id" text;--> statement-breakpoint
INSERT INTO "team" ("id", "name") VALUES ('1st XV', '1st XV') ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "match_details" SET "team_id" = COALESCE(
  (SELECT "event_team"."team_id" FROM "event_team" WHERE "event_team"."event_id" = "match_details"."event_id" ORDER BY "event_team"."id" LIMIT 1),
  '1st XV'
);--> statement-breakpoint
ALTER TABLE "match_details" ALTER COLUMN "team_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "match_details" ADD CONSTRAINT "match_details_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE "event" SET "title" = (SELECT "team"."name" || ' vs ' || "match_details"."opponent" FROM "match_details" JOIN "team" ON "team"."id" = "match_details"."team_id" WHERE "match_details"."event_id" = "event"."id") WHERE "event_type" = 'match';--> statement-breakpoint
UPDATE "event" SET "title" = 'Training @ ' || "venue" WHERE "event_type" = 'training';--> statement-breakpoint
UPDATE "series" SET "title" = 'Training @ ' || "venue" WHERE "event_type" = 'training';--> statement-breakpoint
ALTER TABLE "event_team" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "series_team" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "event_team" CASCADE;--> statement-breakpoint
DROP TABLE "series_team" CASCADE;
