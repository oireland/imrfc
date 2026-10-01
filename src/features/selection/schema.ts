import { index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "@/features/users";

// How many Shirts a Match's pitch has: 23 by default, more once someone adds Shirts.
export const selectionPitch = pgTable("selection_pitch", {
  eventId: text("event_id").primaryKey(),
  shirtCount: integer("shirt_count").notNull(),
});

// One row per filled Shirt (an empty Shirt has no row), so each Shirt saves on its own.
// A Shirt holds a Player (`userId`) or a Guest's name, never both.
export const selectionShirt = pgTable(
  "selection_shirt",
  {
    eventId: text("event_id").notNull(),
    shirt: integer("shirt").notNull(),
    userId: text("user_id").references(() => user.id),
    guestName: text("guest_name"),
    updatedById: text("updated_by_id")
      .notNull()
      .references(() => user.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.shirt] }), index("selection_shirt_user_id_idx").on(t.userId)],
);
