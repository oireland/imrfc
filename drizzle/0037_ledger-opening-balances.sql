ALTER TABLE "movement_log_entry" DROP CONSTRAINT "movement_log_entry_kind_valid";--> statement-breakpoint
ALTER TABLE "movement_log_entry" DROP CONSTRAINT "movement_log_entry_user_known";--> statement-breakpoint
ALTER TABLE "movement_log_entry" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "movement_log_entry" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "movement_log_entry" ADD CONSTRAINT "movement_log_entry_kind_valid" CHECK ("movement_log_entry"."kind" in ('added', 'opening', 'bought', 'lost', 'move', 'unconfirmed', 'condition_note'));--> statement-breakpoint
ALTER TABLE "movement_log_entry" ADD CONSTRAINT "movement_log_entry_user_known" CHECK ("movement_log_entry"."user_id" is not null or "movement_log_entry"."kind" in ('unconfirmed', 'added', 'opening'));
--> statement-breakpoint
-- Units from before the ledger can't replay from their log (no "added" entry, Unconfirmed changes and
-- some "lost" sources unlogged). So every unit gets an opening balance: one entry per Portion, no User,
-- written now. Replay starts afresh at the first opening entry after other entries, so it gives
-- today's Portions; the older entries stay for the history page.
INSERT INTO "movement_log_entry" ("id", "equipment_unit_id", "kind", "count", "to_type", "to_store_id", "to_holder_id", "to_last_seen_event_id")
SELECT gen_random_uuid()::text, p."equipment_unit_id", 'opening', p."count", p."whereabouts_type", p."store_id", p."holder_id", p."last_seen_event_id"
FROM "equipment_portion" p
ORDER BY p."equipment_unit_id", p."id";
