-- Kit Units become Equipment Units, and Kit Portions become Equipment Portions.
-- Hand-written (not drizzle-kit's drop-and-recreate) so no data is lost; constraint and index names follow.

-- 1. The tables and their own constraints.
ALTER TABLE "kit_unit" RENAME TO "equipment_unit";--> statement-breakpoint
ALTER TABLE "equipment_unit" RENAME CONSTRAINT "kit_unit_pkey" TO "equipment_unit_pkey";--> statement-breakpoint
ALTER TABLE "equipment_unit" RENAME CONSTRAINT "kit_unit_home_id_store_id_fk" TO "equipment_unit_home_id_store_id_fk";--> statement-breakpoint
ALTER TABLE "kit_portion" RENAME TO "equipment_portion";--> statement-breakpoint
ALTER TABLE "equipment_portion" RENAME CONSTRAINT "kit_portion_pkey" TO "equipment_portion_pkey";--> statement-breakpoint
ALTER TABLE "equipment_portion" RENAME CONSTRAINT "kit_portion_store_id_store_id_fk" TO "equipment_portion_store_id_store_id_fk";--> statement-breakpoint
ALTER TABLE "equipment_portion" RENAME CONSTRAINT "kit_portion_holder_id_user_id_fk" TO "equipment_portion_holder_id_user_id_fk";--> statement-breakpoint

-- 2. Every column that points at an Equipment Unit.
ALTER TABLE "equipment_portion" RENAME COLUMN "kit_unit_id" TO "equipment_unit_id";--> statement-breakpoint
ALTER TABLE "equipment_portion" RENAME CONSTRAINT "kit_portion_kit_unit_id_kit_unit_id_fk" TO "equipment_portion_equipment_unit_id_equipment_unit_id_fk";--> statement-breakpoint
ALTER INDEX "kit_portion_kit_unit_id_idx" RENAME TO "equipment_portion_equipment_unit_id_idx";--> statement-breakpoint
ALTER TABLE "movement_log_entry" RENAME COLUMN "kit_unit_id" TO "equipment_unit_id";--> statement-breakpoint
ALTER TABLE "movement_log_entry" RENAME CONSTRAINT "movement_log_entry_kit_unit_id_kit_unit_id_fk" TO "movement_log_entry_equipment_unit_id_equipment_unit_id_fk";--> statement-breakpoint
ALTER INDEX "movement_log_entry_kit_unit_id_idx" RENAME TO "movement_log_entry_equipment_unit_id_idx";--> statement-breakpoint
ALTER TABLE "checklist_item" RENAME COLUMN "kit_unit_id" TO "equipment_unit_id";--> statement-breakpoint
ALTER TABLE "checklist_item" RENAME CONSTRAINT "checklist_item_kit_unit_id_kit_unit_id_fk" TO "checklist_item_equipment_unit_id_equipment_unit_id_fk";--> statement-breakpoint
ALTER TABLE "checklist_item" RENAME CONSTRAINT "checklist_item_checklist_id_kit_unit_id_unique" TO "checklist_item_checklist_id_equipment_unit_id_unique";--> statement-breakpoint
ALTER TABLE "duty" RENAME COLUMN "kit_unit_id" TO "equipment_unit_id";--> statement-breakpoint
ALTER TABLE "duty" RENAME CONSTRAINT "duty_kit_unit_id_kit_unit_id_fk" TO "duty_equipment_unit_id_equipment_unit_id_fk";--> statement-breakpoint
ALTER TABLE "duty" RENAME CONSTRAINT "duty_event_id_kit_unit_id_direction_unique" TO "duty_event_id_equipment_unit_id_direction_unique";--> statement-breakpoint
ALTER INDEX "duty_kit_unit_id_idx" RENAME TO "duty_equipment_unit_id_idx";
