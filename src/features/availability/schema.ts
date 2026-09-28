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

// When Committee Announced an Event (for Matches, the whole day's Matches: one row
// covers the group) and the optional Reply By.
export const availabilityAnnouncement = pgTable(
  "availability_announcement",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    announcedById: text("announced_by_id")
      .notNull()
      .references(() => user.id),
    replyBy: timestamp("reply_by", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("availability_announcement_event_id_idx").on(t.eventId)],
);

// Every Nudge email sent, one row per Player, so the card can say "nudged 2h ago".
export const availabilityNudge = pgTable(
  "availability_nudge",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    nudgedById: text("nudged_by_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("availability_nudge_event_id_idx").on(t.eventId)],
);
