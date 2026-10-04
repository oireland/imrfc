CREATE TABLE "selection_notice" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"kind" text NOT NULL,
	"sent_by_id" text NOT NULL,
	"recipients" jsonb NOT NULL,
	"reached_ids" text[] DEFAULT '{}' NOT NULL,
	"missed_ids" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "selection_sent" (
	"event_id" text NOT NULL,
	"shirt" integer NOT NULL,
	"user_id" text,
	"guest_name" text,
	"roles" text[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "selection_sent_event_id_shirt_pk" PRIMARY KEY("event_id","shirt")
);
--> statement-breakpoint
CREATE TABLE "team_naming" (
	"event_id" text PRIMARY KEY NOT NULL,
	"named_at" timestamp with time zone NOT NULL,
	"named_by_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "selection_notice" ADD CONSTRAINT "selection_notice_sent_by_id_user_id_fk" FOREIGN KEY ("sent_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selection_sent" ADD CONSTRAINT "selection_sent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_naming" ADD CONSTRAINT "team_naming_named_by_id_user_id_fk" FOREIGN KEY ("named_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "selection_notice_event_id_idx" ON "selection_notice" USING btree ("event_id");