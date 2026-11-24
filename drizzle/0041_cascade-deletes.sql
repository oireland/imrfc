ALTER TABLE "checklist_item" DROP CONSTRAINT "checklist_item_checklist_id_checklist_id_fk";
--> statement-breakpoint
ALTER TABLE "duty_user" DROP CONSTRAINT "duty_user_duty_id_duty_id_fk";
--> statement-breakpoint
ALTER TABLE "match_details" DROP CONSTRAINT "match_details_event_id_event_id_fk";
--> statement-breakpoint
ALTER TABLE "injury_change" DROP CONSTRAINT "injury_change_injury_id_injury_id_fk";
--> statement-breakpoint
ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_checklist_id_checklist_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."checklist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_user" ADD CONSTRAINT "duty_user_duty_id_duty_id_fk" FOREIGN KEY ("duty_id") REFERENCES "public"."duty"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_details" ADD CONSTRAINT "match_details_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injury_change" ADD CONSTRAINT "injury_change_injury_id_injury_id_fk" FOREIGN KEY ("injury_id") REFERENCES "public"."injury"("id") ON DELETE cascade ON UPDATE no action;