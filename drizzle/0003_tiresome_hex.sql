CREATE TABLE "movement_log_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"kit_unit_id" text NOT NULL,
	"kind" text NOT NULL,
	"user_id" text NOT NULL,
	"reason" text,
	"to_type" text,
	"to_store_id" text,
	"to_holder_id" text,
	"condition_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kit_unit" ADD COLUMN "whereabouts_type" text DEFAULT 'store' NOT NULL;--> statement-breakpoint
ALTER TABLE "kit_unit" ADD COLUMN "store_id" text;--> statement-breakpoint
ALTER TABLE "kit_unit" ADD COLUMN "holder_id" text;--> statement-breakpoint
ALTER TABLE "movement_log_entry" ADD CONSTRAINT "movement_log_entry_kit_unit_id_kit_unit_id_fk" FOREIGN KEY ("kit_unit_id") REFERENCES "public"."kit_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_log_entry" ADD CONSTRAINT "movement_log_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_log_entry" ADD CONSTRAINT "movement_log_entry_to_store_id_location_id_fk" FOREIGN KEY ("to_store_id") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_log_entry" ADD CONSTRAINT "movement_log_entry_to_holder_id_user_id_fk" FOREIGN KEY ("to_holder_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_unit" ADD CONSTRAINT "kit_unit_store_id_location_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_unit" ADD CONSTRAINT "kit_unit_holder_id_user_id_fk" FOREIGN KEY ("holder_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;