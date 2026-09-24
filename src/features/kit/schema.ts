import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { location } from "@/features/locations";
import { user } from "@/features/users";

export const kitUnit = pgTable("kit_unit", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  homeId: text("home_id")
    .notNull()
    .references(() => location.id),
  status: text("status", { enum: ["active", "missing", "retired"] })
    .notNull()
    .default("active"),
  conditionNote: text("condition_note").notNull().default(""),
  // Whereabouts is exactly one of a Store, a Holder, or Unconfirmed (last seen at an Event).
  whereaboutsType: text("whereabouts_type", { enum: ["store", "holder", "unconfirmed"] })
    .notNull()
    .default("store"),
  storeId: text("store_id").references(() => location.id),
  holderId: text("holder_id").references(() => user.id),
  // Plain Event id (kit never imports events); set only while Unconfirmed.
  lastSeenEventId: text("last_seen_event_id"),
});

export const movementLogEntry = pgTable("movement_log_entry", {
  id: text("id").primaryKey(),
  kitUnitId: text("kit_unit_id")
    .notNull()
    .references(() => kitUnit.id),
  kind: text("kind", { enum: ["move", "condition_note"] }).notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  // Move fields (kind = "move")
  reason: text("reason", { enum: ["ad_hoc", "duty"] }),
  toType: text("to_type", { enum: ["store", "holder"] }),
  toStoreId: text("to_store_id").references(() => location.id),
  toHolderId: text("to_holder_id").references(() => user.id),
  // Condition Note fields (kind = "condition_note")
  conditionNote: text("condition_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
