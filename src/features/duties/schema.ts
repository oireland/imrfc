import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { kitUnit } from "@/features/kit";
import { location } from "@/features/locations";
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
    userId: text("user_id").references(() => user.id),
    // From Duties only: Home (default), a specific Store, or the Duty's User as Holder.
    destinationType: text("destination_type", { enum: ["home", "store", "holder"] })
      .notNull()
      .default("home"),
    destinationStoreId: text("destination_store_id").references(() => location.id),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    // Set when the Event is Cancelled: a voided Duty can no longer be Confirmed.
    voidedAt: timestamp("voided_at", { withTimezone: true }),
  },
  (t) => [unique().on(t.eventId, t.kitUnitId, t.direction)],
);
