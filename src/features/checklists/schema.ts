import { integer, pgTable, text, unique } from "drizzle-orm/pg-core";
import { kitUnit } from "@/features/kit";

// A row here means that level has its own Checklist (possibly empty). Scope ids
// are plain text — an Event type name, a Series id or an Event id — so this
// feature references events by id without importing their internals.
export const checklist = pgTable(
  "checklist",
  {
    id: text("id").primaryKey(),
    scope: text("scope", { enum: ["event_type", "series", "event"] }).notNull(),
    scopeId: text("scope_id").notNull(),
  },
  (t) => [unique().on(t.scope, t.scopeId)],
);

export const checklistItem = pgTable(
  "checklist_item",
  {
    id: text("id").primaryKey(),
    checklistId: text("checklist_id")
      .notNull()
      .references(() => checklist.id),
    kitUnitId: text("kit_unit_id")
      .notNull()
      .references(() => kitUnit.id),
    // How many of the Kit Unit this line asks for: null means "all of them", so it
    // follows the Kit Unit's Quantity; a number is capped at the Quantity when resolved.
    count: integer("count"),
  },
  (t) => [unique().on(t.checklistId, t.kitUnitId)],
);
