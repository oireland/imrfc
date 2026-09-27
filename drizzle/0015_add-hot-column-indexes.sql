CREATE INDEX "duty_event_id_idx" ON "duty" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "duty_kit_unit_id_idx" ON "duty" USING btree ("kit_unit_id");--> statement-breakpoint
CREATE INDEX "event_series_id_idx" ON "event" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "event_start_idx" ON "event" USING btree ("start");--> statement-breakpoint
CREATE INDEX "event_end_idx" ON "event" USING btree ("end");--> statement-breakpoint
CREATE INDEX "kit_portion_kit_unit_id_idx" ON "kit_portion" USING btree ("kit_unit_id");--> statement-breakpoint
CREATE INDEX "movement_log_entry_kit_unit_id_idx" ON "movement_log_entry" USING btree ("kit_unit_id");--> statement-breakpoint
CREATE INDEX "duty_user_user_id_idx" ON "duty_user" USING btree ("user_id");