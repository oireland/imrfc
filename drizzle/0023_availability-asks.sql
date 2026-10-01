CREATE TABLE "availability_ask" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"kind" text NOT NULL,
	"asked_by_id" text NOT NULL,
	"player_ids" text[] NOT NULL,
	"reached_ids" text[] DEFAULT '{}' NOT NULL,
	"missed_ids" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "availability_ask" ADD CONSTRAINT "availability_ask_asked_by_id_user_id_fk" FOREIGN KEY ("asked_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_ask_event_id_idx" ON "availability_ask" USING btree ("event_id");