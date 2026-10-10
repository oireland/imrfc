import { boolean, date, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "@/features/users";
import { BODY_AREAS, OPEN_STATUSES } from "./rules";

// Something a Player has hurt. Never deleted: one logged in error gets `mistakeAt` and drops
// out of every view; a Cleared one stays as history. The Event it happened at is a plain id so
// this feature never reaches into `events`.
export const injury = pgTable(
  "injury",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    area: text("area", { enum: BODY_AREAS }).notNull(),
    description: text("description").notNull().default(""),
    happenedOn: date("happened_on", { mode: "string" }).notNull(),
    eventId: text("event_id"),
    status: text("status", { enum: [...OPEN_STATUSES, "cleared"] as const }).notNull(),
    expectedReturn: date("expected_return", { mode: "string" }),
    needsPhysio: boolean("needs_physio").notNull().default(false),
    physioNote: text("physio_note").notNull().default(""),
    reportedById: text("reported_by_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
    mistakeAt: timestamp("mistake_at", { withTimezone: true }),
  },
  (t) => [index("injury_user_id_idx").on(t.userId)],
);

// Every change to an Injury, with who made it and when: the history.
export const injuryChange = pgTable(
  "injury_change",
  {
    id: text("id").primaryKey(),
    injuryId: text("injury_id")
      .notNull()
      .references(() => injury.id),
    kind: text("kind", { enum: ["reported", "updated", "cleared", "mistake"] }).notNull(),
    fromStatus: text("from_status", { enum: [...OPEN_STATUSES, "cleared"] as const }),
    toStatus: text("to_status", { enum: [...OPEN_STATUSES, "cleared"] as const }),
    note: text("note").notNull().default(""),
    byId: text("by_id")
      .notNull()
      .references(() => user.id),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("injury_change_injury_id_idx").on(t.injuryId)],
);
