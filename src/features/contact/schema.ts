import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "@/features/users";

// A User's optional Mobile number in E.164 form; no row means no number. Owned here so
// the `users` feature never holds it, and wiped (row deleted) when the account is deleted.
export const mobileNumber = pgTable("mobile_number", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id),
  number: text("number").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
