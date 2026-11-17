import { sql, type SQL } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text, timestamp, type AnyPgColumn } from "drizzle-orm/pg-core";
import { store } from "@/features/stores";
import { event } from "@/features/events";
import { user } from "@/features/users";

const EQUIPMENT_STATUSES = ["active", "missing", "retired"] as const;
const PLACE_TYPES = ["store", "holder", "unconfirmed"] as const;
// Every kind but condition_note changes the Whereabouts; see ledger.ts.
const LOG_KINDS = ["added", "opening", "bought", "lost", "move", "unconfirmed", "condition_note"] as const;
const MOVE_REASONS = ["ad_hoc", "duty"] as const;

/** A CHECK that the column holds one of the enum's values (or NULL); Drizzle's text enums are TypeScript-only. */
function oneOf(column: AnyPgColumn, values: readonly string[]): SQL {
  return sql`${column} in (${sql.raw(values.map((v) => `'${v}'`).join(", "))})`;
}

export const equipmentUnit = pgTable(
  "equipment_unit",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    homeId: text("home_id")
      .notNull()
      .references(() => store.id),
    status: text("status", { enum: EQUIPMENT_STATUSES }).notNull().default("active"),
    conditionNote: text("condition_note").notNull().default(""),
    // How many of this Equipment Unit the club has; hidden in the UI when 1.
    quantity: integer("quantity").notNull().default(1),
  },
  (t) => [
    check("equipment_unit_quantity_positive", sql`${t.quantity} >= 1`),
    check("equipment_unit_status_valid", oneOf(t.status, EQUIPMENT_STATUSES)),
  ],
);

// Whereabouts as portions: each is a count at exactly one Place (a Store, a Holder, or
// Unconfirmed — last seen at an Event). Portions at the same Place merge; their counts
// always add up to the Equipment Unit's Quantity, which the database checks at commit
// (migration 0034).
export const equipmentPortion = pgTable(
  "equipment_portion",
  {
    id: text("id").primaryKey(),
    equipmentUnitId: text("equipment_unit_id")
      .notNull()
      .references(() => equipmentUnit.id),
    count: integer("count").notNull(),
    whereaboutsType: text("whereabouts_type", { enum: PLACE_TYPES }).notNull(),
    storeId: text("store_id").references(() => store.id),
    holderId: text("holder_id").references(() => user.id),
    // Set only while Unconfirmed. An Event can't be deleted while equipment was last seen there.
    lastSeenEventId: text("last_seen_event_id").references(() => event.id),
  },
  (t) => [
    index("equipment_portion_equipment_unit_id_idx").on(t.equipmentUnitId),
    check("equipment_portion_count_positive", sql`${t.count} > 0`),
    // Also the enum check for whereabouts_type: each branch names one of its values.
    check(
      "equipment_portion_one_place",
      sql`(${t.whereaboutsType} = 'store' and ${t.storeId} is not null and ${t.holderId} is null and ${t.lastSeenEventId} is null)
        or (${t.whereaboutsType} = 'holder' and ${t.holderId} is not null and ${t.storeId} is null and ${t.lastSeenEventId} is null)
        or (${t.whereaboutsType} = 'unconfirmed' and ${t.lastSeenEventId} is not null and ${t.storeId} is null and ${t.holderId} is null)`,
    ),
  ],
);

// The ledger: replaying a unit's entries in `seq` order rebuilds its Portions (ledger.ts).
export const movementLogEntry = pgTable(
  "movement_log_entry",
  {
    id: text("id").primaryKey(),
    // Order of writing. created_at can't order entries: it's the same for every entry in a transaction.
    seq: bigint("seq", { mode: "number" }).notNull().generatedAlwaysAsIdentity(),
    equipmentUnitId: text("equipment_unit_id")
      .notNull()
      .references(() => equipmentUnit.id),
    kind: text("kind", { enum: LOG_KINDS }).notNull(),
    // Null for Unconfirmed (nobody records it: it happens when nobody Confirms) and for stock added
    // with no known User.
    userId: text("user_id").references(() => user.id),
    // Move fields (kind = "move")
    reason: text("reason", { enum: MOVE_REASONS }),
    // How many moved, and where from — only meaningful for a counted Equipment Unit.
    count: integer("count"),
    fromType: text("from_type", { enum: PLACE_TYPES }),
    fromStoreId: text("from_store_id").references(() => store.id),
    fromHolderId: text("from_holder_id").references(() => user.id),
    // No foreign key: replay needs the id even after the Event is deleted.
    fromLastSeenEventId: text("from_last_seen_event_id"),
    toType: text("to_type", { enum: PLACE_TYPES }),
    toStoreId: text("to_store_id").references(() => store.id),
    toHolderId: text("to_holder_id").references(() => user.id),
    toLastSeenEventId: text("to_last_seen_event_id"),
    // Condition Note fields (kind = "condition_note")
    conditionNote: text("condition_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("movement_log_entry_equipment_unit_id_idx").on(t.equipmentUnitId),
    check("movement_log_entry_kind_valid", oneOf(t.kind, LOG_KINDS)),
    check("movement_log_entry_reason_valid", oneOf(t.reason, MOVE_REASONS)),
    check("movement_log_entry_from_type_valid", oneOf(t.fromType, PLACE_TYPES)),
    check("movement_log_entry_to_type_valid", oneOf(t.toType, PLACE_TYPES)),
    check("movement_log_entry_user_known", sql`${t.userId} is not null or ${t.kind} in ('unconfirmed', 'added', 'opening')`),
  ],
);
