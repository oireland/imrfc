CREATE TABLE "checklist" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"scope_id" text NOT NULL,
	CONSTRAINT "checklist_scope_scope_id_unique" UNIQUE("scope","scope_id")
);
--> statement-breakpoint
CREATE TABLE "checklist_item" (
	"id" text PRIMARY KEY NOT NULL,
	"checklist_id" text NOT NULL,
	"kit_unit_id" text NOT NULL,
	CONSTRAINT "checklist_item_checklist_id_kit_unit_id_unique" UNIQUE("checklist_id","kit_unit_id")
);
--> statement-breakpoint
ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_checklist_id_checklist_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."checklist"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_kit_unit_id_kit_unit_id_fk" FOREIGN KEY ("kit_unit_id") REFERENCES "public"."kit_unit"("id") ON DELETE no action ON UPDATE no action;