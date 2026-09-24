import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "@/features/users";

// One Feed Token per User; resetting replaces the row's token.
export const feedToken = pgTable("feed_token", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
