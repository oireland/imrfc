CREATE TABLE "selection_pitch" (
	"event_id" text PRIMARY KEY NOT NULL,
	"shirt_count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "selection_shirt" (
	"event_id" text NOT NULL,
	"shirt" integer NOT NULL,
	"user_id" text,
	"guest_name" text,
	"updated_by_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "selection_shirt_event_id_shirt_pk" PRIMARY KEY("event_id","shirt")
);
--> statement-breakpoint
ALTER TABLE "selection_shirt" ADD CONSTRAINT "selection_shirt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selection_shirt" ADD CONSTRAINT "selection_shirt_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "selection_shirt_user_id_idx" ON "selection_shirt" USING btree ("user_id");