CREATE TABLE "availability_announcement" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"announced_by_id" text NOT NULL,
	"reply_by" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_nudge" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"nudged_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "availability_announcement" ADD CONSTRAINT "availability_announcement_announced_by_id_user_id_fk" FOREIGN KEY ("announced_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_nudge" ADD CONSTRAINT "availability_nudge_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_nudge" ADD CONSTRAINT "availability_nudge_nudged_by_id_user_id_fk" FOREIGN KEY ("nudged_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_announcement_event_id_idx" ON "availability_announcement" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "availability_nudge_event_id_idx" ON "availability_nudge" USING btree ("event_id");