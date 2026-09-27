import { index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { kitUnit } from "@/features/kit";
import { store } from "@/features/stores";
import { user } from "@/features/users";

// One To Duty and one From Duty per Kit Unit per Event. The Event is referenced
// by plain id so this feature never reaches into `events` internals.
export const duty = pgTable(
  "duty",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    kitUnitId: text("kit_unit_id")
      .notNull()
      .references(() => kitUnit.id),
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
    unique().on(t.eventId, t.kitUnitId, t.direction),
    index("duty_event_id_idx").on(t.eventId),
    index("duty_kit_unit_id_idx").on(t.kitUnitId),
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
