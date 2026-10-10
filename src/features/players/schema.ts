import { date, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "@/features/users";

// A period a Player won't be playing for a non-injury reason. Both dates are London calendar
// days. Never hard-deleted: `removedAt` hides one added by mistake or not yet started.
export const playerAway = pgTable(
  "player_away",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    from: date("from_date", { mode: "string" }).notNull(),
    until: date("until_date", { mode: "string" }).notNull(),
    reason: text("reason").notNull(),
    setById: text("set_by_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (t) => [index("player_away_user_id_idx").on(t.userId)],
);
