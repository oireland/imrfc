import { index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { equipmentUnit } from "@/features/equipment";
import { store } from "@/features/stores";
import { event } from "@/features/events";
import { user } from "@/features/users";

// One To Duty and one From Duty per Equipment Unit per Event.
export const duty = pgTable(
  "duty",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull().references(() => event.id),
    equipmentUnitId: text("equipment_unit_id")
      .notNull()
      .references(() => equipmentUnit.id),
    direction: text("direction", { enum: ["to", "from"] }).notNull(),
    // From Duties only: Home (default), a specific Store, or the Duty's Users as Holders.
    destinationType: text("destination_type", { enum: ["home", "store", "holder"] })
      .notNull()
      .default("home"),
    destinationStoreId: text("destination_store_id").references(() => store.id),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    // Set when the Event is Cancelled: a voided Duty can no longer be Confirmed.
    voidedAt: timestamp("voided_at", { withTimezone: true }),
  },
  (t) => [
    unique().on(t.eventId, t.equipmentUnitId, t.direction),
    index("duty_event_id_idx").on(t.eventId),
    index("duty_equipment_unit_id_idx").on(t.equipmentUnitId),
  ],
);

// Slice 18 — Shared Duties: a Duty can have several Users. Replaces the single
// `duty.user_id` column (migration 0014 copies existing rows across).
export const dutyUser = pgTable(
  "duty_user",
  {
    id: text("id").primaryKey(),
    dutyId: text("duty_id")
      .notNull()
      .references(() => duty.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
  },
  (t) => [unique().on(t.dutyId, t.userId), index("duty_user_user_id_idx").on(t.userId)],
);
