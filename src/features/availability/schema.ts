import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "@/features/users";

// Every reply a Player (or Committee for them) has given, never deleted: a Player's
// Availability for an Event is their latest reply. The Event is referenced by plain id
// so this feature never reaches into `events` internals.
export const availabilityReply = pgTable(
  "availability_reply",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    status: text("status", { enum: ["available", "not_available"] }).notNull(),
    note: text("note").notNull().default(""),
    reason: text("reason").notNull().default(""),
    setById: text("set_by_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("availability_reply_event_id_idx").on(t.eventId), index("availability_reply_user_id_idx").on(t.userId)],
);
