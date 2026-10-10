CREATE TABLE "availability_messaged" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"messaged_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "availability_messaged" ADD CONSTRAINT "availability_messaged_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_messaged" ADD CONSTRAINT "availability_messaged_messaged_by_id_user_id_fk" FOREIGN KEY ("messaged_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_messaged_event_id_idx" ON "availability_messaged" USING btree ("event_id");