import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { user } from "@/features/users";

// One row per subscribed device/browser. `endpoint` is the browser's push URL — unique,
// since re-subscribing the same device replaces its keys rather than duplicating the row.
export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [unique().on(t.endpoint)],
);
