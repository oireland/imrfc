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
    // Match Day Roles ("C", "KD"…) of whoever is on the Shirt; they leave with the person.
    roles: text("roles").array().notNull().default([]),
    updatedById: text("updated_by_id")
      .notNull()
      .references(() => user.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.shirt] }), index("selection_shirt_user_id_idx").on(t.userId)],
);

// A Match's Team Sheet fields that differ from what the Event and the Team's Sheet Defaults
// say. A null column follows the Event or the default.
export const teamSheet = pgTable("team_sheet", {
  eventId: text("event_id").primaryKey(),
  title: text("title"),
  kickoff: text("kickoff"),
  meet: text("meet"),
  location: text("location"),
  schedule: text("schedule"),
  travelAttire: text("travel_attire"),
  warmUpAttire: text("warm_up_attire"),
  postMatchActivity: text("post_match_activity"),
  message: text("message"),
});

// Sheet Defaults, kept per Team. Only what has been saved has a value.
export const teamSheetDefault = pgTable("team_sheet_default", {
  teamId: text("team_id").primaryKey(),
  travelAttire: text("travel_attire"),
  warmUpAttire: text("warm_up_attire"),
  postMatchActivity: text("post_match_activity"),
  message: text("message"),
});
