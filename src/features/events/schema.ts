import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const team = pgTable("team", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const series = pgTable("series", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  // Match isn't a Series Event Type: it needs an opponent and other Match-only details.
  eventType: text("event_type", { enum: ["training", "social"] }).notNull().default("training"),
  weekdays: integer("weekdays").array().notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  // Free text (e.g. "Harlington" or an away ground's address); Venues aren't stored separately.
  venue: text("venue").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  notes: text("notes").notNull().default(""),
});

export const seriesTeam = pgTable("series_team", {
  id: text("id").primaryKey(),
  seriesId: text("series_id")
    .notNull()
    .references(() => series.id),
  teamId: text("team_id")
    .notNull()
    .references(() => team.id),
});

export const event = pgTable(
  "event",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    eventType: text("event_type", { enum: ["training", "match", "social"] }).notNull(),
    start: timestamp("start", { withTimezone: true }).notNull(),
    end: timestamp("end", { withTimezone: true }).notNull(),
    // Free text (e.g. "Harlington" or an away ground's address); Venues aren't stored separately.
    venue: text("venue").notNull(),
    notes: text("notes").notNull().default(""),
    cancelled: boolean("cancelled").notNull().default(false),
    // Set for Occurrences; `edited` marks an Occurrence changed on its own, which
    // "this and future" edits must not overwrite.
    seriesId: text("series_id").references(() => series.id),
    edited: boolean("edited").notNull().default(false),
  },
  (t) => [
    index("event_series_id_idx").on(t.seriesId),
    index("event_start_idx").on(t.start),
    index("event_end_idx").on(t.end),
  ],
);

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
