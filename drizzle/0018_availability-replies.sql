CREATE TABLE "availability_reply" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"set_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "availability_reply" ADD CONSTRAINT "availability_reply_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_reply" ADD CONSTRAINT "availability_reply_set_by_id_user_id_fk" FOREIGN KEY ("set_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_reply_event_id_idx" ON "availability_reply" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "availability_reply_user_id_idx" ON "availability_reply" USING btree ("user_id");