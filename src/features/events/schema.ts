import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { location } from "@/features/locations";

export const team = pgTable("team", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const event = pgTable("event", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  eventType: text("event_type", { enum: ["training", "match", "social"] }).notNull(),
  start: timestamp("start", { withTimezone: true }).notNull(),
  end: timestamp("end", { withTimezone: true }).notNull(),
  venueId: text("venue_id")
    .notNull()
    .references(() => location.id),
  notes: text("notes").notNull().default(""),
  cancelled: boolean("cancelled").notNull().default(false),
});

export const eventTeam = pgTable("event_team", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => event.id),
  teamId: text("team_id")
    .notNull()
    .references(() => team.id),
});

// Type-specific details live in their own table keyed by Event id, so new
// Event Types can add fields without touching this one or the Event table.
export const matchDetails = pgTable("match_details", {
  eventId: text("event_id")
    .primaryKey()
    .references(() => event.id),
  opponent: text("opponent").notNull(),
  homeAway: text("home_away", { enum: ["home", "away"] }).notNull(),
  competition: text("competition", { enum: ["bucs", "lusl", "friendly", "other"] }).notNull(),
  meetTime: timestamp("meet_time", { withTimezone: true }).notNull(),
  travelMeetTime: timestamp("travel_meet_time", { withTimezone: true }),
  travelMeetPoint: text("travel_meet_point"),
});
