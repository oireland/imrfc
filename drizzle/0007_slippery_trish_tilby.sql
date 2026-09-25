CREATE TABLE "duty" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"kit_unit_id" text NOT NULL,
	"direction" text NOT NULL,
	"user_id" text,
	"destination_type" text DEFAULT 'home' NOT NULL,
	"destination_store_id" text,
	CONSTRAINT "duty_event_id_kit_unit_id_direction_unique" UNIQUE("event_id","kit_unit_id","direction")
);
--> statement-breakpoint
ALTER TABLE "duty" ADD CONSTRAINT "duty_kit_unit_id_kit_unit_id_fk" FOREIGN KEY ("kit_unit_id") REFERENCES "public"."kit_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty" ADD CONSTRAINT "duty_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty" ADD CONSTRAINT "duty_destination_store_id_location_id_fk" FOREIGN KEY ("destination_store_id") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;