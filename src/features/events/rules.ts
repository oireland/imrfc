import { LIMITS, firstTooLong } from "@/lib/text-limits";
import { londonParts, londonToUtc } from "./series-rules";

export type EventType = "training" | "match" | "social";
export type HomeAway = "home" | "away";
export type Competition = "bucs" | "lusl" | "friendly" | "other";

export type NewEventCommon = {
  eventType: EventType;
  start: Date;
  end: Date;
  /** The kick-off isn't known yet: `start` and `end` only hold the day. */
  startTbc?: boolean;
  venue: string;
  notes?: string;
};

export type NewMatchDetails = {
  teamId: string;
  opponent: string;
  homeAway: HomeAway;
  competition: Competition;
  /** Left out while Meet Time is TBC. */
  meetTime?: Date;
  /** Left out while Travel Meet Time is TBC. */
  travelMeetTime?: Date;
  travelMeetPoint?: string;
  schedule?: string;
  travelAttire?: string;
  warmUpAttire?: string;
  postMatchActivity?: string;
};

export type NewEvent =
  | (NewEventCommon & { eventType: "match"; matchDetails: NewMatchDetails })
  | (NewEventCommon & { eventType: "training" })
  | (NewEventCommon & { eventType: "social"; title: string });

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateEvent(input: NewEvent): ValidationResult {
  const m = input.eventType === "match" ? input.matchDetails : undefined;
  const tooLong = firstTooLong([
    ["title", input.eventType === "social" ? input.title : undefined, LIMITS.name],
    ["venue", input.venue, LIMITS.line],
    ["notes", input.notes, LIMITS.note],
    ["opponent", m?.opponent, LIMITS.name],
    ["meeting point", m?.travelMeetPoint, LIMITS.line],
    ["schedule", m?.schedule, LIMITS.note],
    ["travel attire", m?.travelAttire, LIMITS.line],
    ["warm-up attire", m?.warmUpAttire, LIMITS.line],
    ["post-match plan", m?.postMatchActivity, LIMITS.line],
  ]);
  if (tooLong) return { ok: false, error: tooLong };
  if (input.eventType === "social" && !input.title.trim()) return { ok: false, error: "Give the event a title." };
  if (!input.venue.trim()) return { ok: false, error: "Where is it? Add a venue." };
  if (input.end < input.start) return { ok: false, error: "The event can't end before it starts." };
  if (input.eventType === "match") {
    if (!input.matchDetails.teamId.trim()) return { ok: false, error: "Which team is playing? Pick a team." };
    if (!input.matchDetails.opponent.trim()) {
      return { ok: false, error: "Who's the match against? Add an opponent." };
    }
  }
  return { ok: true };
}

/** "Training @ Harlington". */
export function trainingTitle(venue: string): string {
  return `Training @ ${venue.trim()}`;
}

/** "1st XV vs St Georges". */
export function matchTitle(teamName: string, opponent: string): string {
  return `${teamName} vs ${opponent.trim()}`;
}

/** What an Event is called: derived from its details, except a Social, which is titled by hand. */
export function eventTitle(input: NewEvent, teamName?: string): string {
  if (input.eventType === "social") return input.title.trim();
  if (input.eventType === "match") return matchTitle(teamName ?? input.matchDetails.teamId, input.matchDetails.opponent);
  return trainingTitle(input.venue);
}

/** An Event is Past once it has ended; otherwise it is Upcoming. */
export function classifyEvent(event: { end: Date }, now: Date): "upcoming" | "past" {
  return event.end < now ? "past" : "upcoming";
}

/**
 * When an Event is treated as having started. A Match whose kick-off is TBC only has a day, so
 * it counts as starting at the end of that London day rather than at midnight.
 */
export function startsAt(e: { start: Date; startTbc?: boolean }): Date {
  return e.startTbc ? londonToUtc(londonParts(e.start).date, "23:59") : e.start;
}
