-- Events deleted before these constraints existed left rows behind; clear them first.
DELETE FROM "duty_user" WHERE "duty_id" IN (SELECT d."id" FROM "duty" d WHERE NOT EXISTS (SELECT 1 FROM "event" e WHERE e."id" = d."event_id"));
--> statement-breakpoint
DELETE FROM "duty" t WHERE NOT EXISTS (SELECT 1 FROM "event" e WHERE e."id" = t."event_id");
--> statement-breakpoint
DELETE FROM "availability_reply" t WHERE NOT EXISTS (SELECT 1 FROM "event" e WHERE e."id" = t."event_id");
--> statement-breakpoint
DELETE FROM "availability_announcement" t WHERE NOT EXISTS (SELECT 1 FROM "event" e WHERE e."id" = t."event_id");
--> statement-breakpoint
DELETE FROM "availability_nudge" t WHERE NOT EXISTS (SELECT 1 FROM "event" e WHERE e."id" = t."event_id");
--> statement-breakpoint
DELETE FROM "availability_messaged" t WHERE NOT EXISTS (SELECT 1 FROM "event" e WHERE e."id" = t."event_id");
--> statement-breakpoint
DELETE FROM "availability_ask" t WHERE NOT EXISTS (SELECT 1 FROM "event" e WHERE e."id" = t."event_id");
--> statement-breakpoint
DELETE FROM "selection_shirt" t WHERE NOT EXISTS (SELECT 1 FROM "event" e WHERE e."id" = t."event_id");
--> statement-breakpoint
DELETE FROM "selection_pitch" t WHERE NOT EXISTS (SELECT 1 FROM "event" e WHERE e."id" = t."event_id");
--> statement-breakpoint
DELETE FROM "selection_sent" t WHERE NOT EXISTS (SELECT 1 FROM "event" e WHERE e."id" = t."event_id");
--> statement-breakpoint
DELETE FROM "selection_notice" t WHERE NOT EXISTS (SELECT 1 FROM "event" e WHERE e."id" = t."event_id");
--> statement-breakpoint
DELETE FROM "team_naming" t WHERE NOT EXISTS (SELECT 1 FROM "event" e WHERE e."id" = t."event_id");
--> statement-breakpoint
UPDATE "injury" i SET "event_id" = NULL WHERE i."event_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "event" e WHERE e."id" = i."event_id");
--> statement-breakpoint
-- Equipment last seen at a deleted Event has no Place left to point at, so it goes to its Home.
WITH orphans AS (
  DELETE FROM "equipment_portion" p
  WHERE p."last_seen_event_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "event" e WHERE e."id" = p."last_seen_event_id")
  RETURNING p."equipment_unit_id", p."count"
), totals AS (
  SELECT o."equipment_unit_id", sum(o."count")::integer AS "count", u."home_id"
  FROM orphans o JOIN "equipment_unit" u ON u."id" = o."equipment_unit_id"
  GROUP BY o."equipment_unit_id", u."home_id"
), merged AS (
  UPDATE "equipment_portion" p SET "count" = p."count" + t."count"
  FROM totals t
  WHERE p."equipment_unit_id" = t."equipment_unit_id" AND p."whereabouts_type" = 'store' AND p."store_id" = t."home_id"
  RETURNING p."equipment_unit_id"
)
INSERT INTO "equipment_portion" ("id", "equipment_unit_id", "count", "whereabouts_type", "store_id")
SELECT gen_random_uuid()::text, t."equipment_unit_id", t."count", 'store', t."home_id"
FROM totals t
WHERE t."equipment_unit_id" NOT IN (SELECT "equipment_unit_id" FROM merged);
--> statement-breakpoint
ALTER TABLE "availability_announcement" ADD CONSTRAINT "availability_announcement_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_ask" ADD CONSTRAINT "availability_ask_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_messaged" ADD CONSTRAINT "availability_messaged_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_nudge" ADD CONSTRAINT "availability_nudge_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_reply" ADD CONSTRAINT "availability_reply_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty" ADD CONSTRAINT "duty_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_portion" ADD CONSTRAINT "equipment_portion_last_seen_event_id_event_id_fk" FOREIGN KEY ("last_seen_event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injury" ADD CONSTRAINT "injury_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selection_notice" ADD CONSTRAINT "selection_notice_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selection_pitch" ADD CONSTRAINT "selection_pitch_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selection_sent" ADD CONSTRAINT "selection_sent_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selection_shirt" ADD CONSTRAINT "selection_shirt_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_naming" ADD CONSTRAINT "team_naming_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;