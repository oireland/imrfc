ALTER TABLE "movement_log_entry" DROP CONSTRAINT "movement_log_entry_kind_valid";--> statement-breakpoint
ALTER TABLE "movement_log_entry" DROP CONSTRAINT "movement_log_entry_to_type_valid";--> statement-breakpoint
ALTER TABLE "movement_log_entry" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
-- Number existing entries in the order they were written, then let new ones count on from there.
ALTER TABLE "movement_log_entry" ADD COLUMN "seq" bigint;--> statement-breakpoint
UPDATE "movement_log_entry" m SET "seq" = o."n"
FROM (SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS "n" FROM "movement_log_entry") o
WHERE o."id" = m."id";--> statement-breakpoint
ALTER TABLE "movement_log_entry" ALTER COLUMN "seq" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "movement_log_entry" ALTER COLUMN "seq" ADD GENERATED ALWAYS AS IDENTITY (sequence name "movement_log_entry_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1);--> statement-breakpoint
SELECT setval('"movement_log_entry_seq_seq"', coalesce(max("seq"), 0) + 1, false) FROM "movement_log_entry";--> statement-breakpoint
ALTER TABLE "movement_log_entry" ADD COLUMN "from_last_seen_event_id" text;--> statement-breakpoint
ALTER TABLE "movement_log_entry" ADD COLUMN "to_last_seen_event_id" text;--> statement-breakpoint
-- Quantity changes were logged as Moves with "Bought 3" / "Lost 2" in the note; give them their own kinds.
UPDATE "movement_log_entry" SET "kind" = 'bought', "reason" = NULL, "condition_note" = NULL
WHERE "kind" = 'move' AND "condition_note" LIKE 'Bought %';--> statement-breakpoint
UPDATE "movement_log_entry" SET "kind" = 'lost', "reason" = NULL, "condition_note" = NULL
WHERE "kind" = 'move' AND "condition_note" LIKE 'Lost %';--> statement-breakpoint
ALTER TABLE "movement_log_entry" ADD CONSTRAINT "movement_log_entry_user_known" CHECK ("movement_log_entry"."user_id" is not null or "movement_log_entry"."kind" in ('unconfirmed', 'added'));--> statement-breakpoint
ALTER TABLE "movement_log_entry" ADD CONSTRAINT "movement_log_entry_kind_valid" CHECK ("movement_log_entry"."kind" in ('added', 'bought', 'lost', 'move', 'unconfirmed', 'condition_note'));--> statement-breakpoint
ALTER TABLE "movement_log_entry" ADD CONSTRAINT "movement_log_entry_to_type_valid" CHECK ("movement_log_entry"."to_type" in ('store', 'holder', 'unconfirmed'));
