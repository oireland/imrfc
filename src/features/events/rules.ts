export type EventType = "training" | "match" | "social";
export type HomeAway = "home" | "away";
export type Competition = "bucs" | "lusl" | "friendly" | "other";

export type NewEventCommon = {
  title: string;
  eventType: EventType;
  start: Date;
  end: Date;
  venue: string;
  notes?: string;
  teamIds?: string[];
};

export type NewMatchDetails = {
  opponent: string;
  homeAway: HomeAway;
  competition: Competition;
  meetTime: Date;
  travelMeetTime?: Date;
  travelMeetPoint?: string;
};

export type NewEvent =
  | (NewEventCommon & { eventType: "match"; matchDetails: NewMatchDetails })
  | (NewEventCommon & { eventType: "training" | "social" });

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateEvent(input: NewEvent): ValidationResult {
  if (!input.title.trim()) return { ok: false, error: "Give the event a title." };
  if (!input.venue.trim()) return { ok: false, error: "Where is it? Add a venue." };
  if (input.end < input.start) return { ok: false, error: "The event can't end before it starts." };
  if (input.eventType === "match") {
    if (!input.matchDetails.opponent.trim()) {
      return { ok: false, error: "Who's the match against? Add an opponent." };
    }
  }
  return { ok: true };
}

/** An Event is Past once it has ended; otherwise it is Upcoming. */
export function classifyEvent(event: { end: Date }, now: Date): "upcoming" | "past" {
  return event.end < now ? "past" : "upcoming";
}
