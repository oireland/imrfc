export type EventType = "training" | "match" | "social";
export type HomeAway = "home" | "away";
export type Competition = "bucs" | "lusl" | "friendly" | "other";

export type NewEventCommon = {
  title: string;
  eventType: EventType;
  start: Date;
  end: Date;
  venueId: string;
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
  if (!input.title.trim()) return { ok: false, error: "An Event needs a title." };
  if (!input.venueId) return { ok: false, error: "An Event needs a Venue." };
  if (input.end < input.start) return { ok: false, error: "An Event can't end before it starts." };
  if (input.eventType === "match") {
    if (!input.matchDetails.opponent.trim()) {
      return { ok: false, error: "A Match needs an opponent." };
    }
  }
  return { ok: true };
}

/** An Event is Past once it has ended; otherwise it is Upcoming. */
export function classifyEvent(event: { end: Date }, now: Date): "upcoming" | "past" {
  return event.end < now ? "past" : "upcoming";
}
