import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { store } from "@/features/stores";
import { user } from "@/features/users";

export const kitUnit = pgTable("kit_unit", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  homeId: text("home_id")
    .notNull()
    .references(() => store.id),
  status: text("status", { enum: ["active", "missing", "retired"] })
    .notNull()
    .default("active"),
  conditionNote: text("condition_note").notNull().default(""),
  // How many of this Kit Unit the club has; hidden in the UI when 1.
  quantity: integer("quantity").notNull().default(1),
});

// Whereabouts as portions: each is a count at exactly one Place (a Store, a Holder, or
// Unconfirmed — last seen at an Event). Portions at the same Place merge; their counts
// always add up to the Kit Unit's Quantity.
export const kitPortion = pgTable(
  "kit_portion",
  {
    id: text("id").primaryKey(),
    kitUnitId: text("kit_unit_id")
      .notNull()
      .references(() => kitUnit.id),
    count: integer("count").notNull(),
    whereaboutsType: text("whereabouts_type", { enum: ["store", "holder", "unconfirmed"] }).notNull(),
    storeId: text("store_id").references(() => store.id),
    holderId: text("holder_id").references(() => user.id),
    // Plain Event id (kit never imports events); set only while Unconfirmed.
    lastSeenEventId: text("last_seen_event_id"),
  },
  (t) => [index("kit_portion_kit_unit_id_idx").on(t.kitUnitId)],
);

export const movementLogEntry = pgTable(
  "movement_log_entry",
  {
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
    // How many moved, and where from — only meaningful for a counted Kit Unit.
    count: integer("count"),
    fromType: text("from_type", { enum: ["store", "holder", "unconfirmed"] }),
    fromStoreId: text("from_store_id").references(() => store.id),
    fromHolderId: text("from_holder_id").references(() => user.id),
    toType: text("to_type", { enum: ["store", "holder"] }),
    toStoreId: text("to_store_id").references(() => store.id),
    toHolderId: text("to_holder_id").references(() => user.id),
    // Condition Note fields (kind = "condition_note")
    conditionNote: text("condition_note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("movement_log_entry_kit_unit_id_idx").on(t.kitUnitId)],
);
