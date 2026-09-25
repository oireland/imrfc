import type { Competition, EventType, HomeAway, NewEvent } from "./rules";
import { londonToUtc, type SeriesPattern } from "./series-rules";

export type QuickEventInput = {
  date: string; // YYYY-MM-DD, London
  startTime: string; // HH:MM, London
  endTime: string;
  type: EventType;
  title: string;
  venue: string;
  opponent?: string;
  homeAway?: HomeAway;
  competition?: Competition;
  meetTime?: string; // HH:MM, London; Matches only, defaults to kick-off
  notes?: string;
  teamIds?: string[]; // none means the whole club
  repeatUntil?: string; // YYYY-MM-DD, London; Training only — repeat weekly on this day up to and including this date
};

const DEFAULT_TITLE: Record<EventType, string> = { training: "Training", match: "Match", social: "Social" };

/**
 * Turns the tap-a-day quick-add form into a NewEvent. Times are London wall clock;
 * an end time before the start time means the Event runs past midnight.
 */
export function buildQuickEvent(input: QuickEventInput): NewEvent {
  const start = londonToUtc(input.date, input.startTime);
  let end = londonToUtc(input.date, input.endTime);
  if (end < start) {
    const next = new Date(`${input.date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    end = londonToUtc(next.toISOString().slice(0, 10), input.endTime);
  }
  const common = {
    start,
    end,
    venue: input.venue.trim(),
    notes: (input.notes ?? "").trim(),
    teamIds: input.teamIds ?? [],
  };

  if (input.type === "match") {
    const opponent = (input.opponent ?? "").trim();
    return {
      ...common,
      eventType: "match",
      title: input.title.trim() || (opponent ? `vs ${opponent}` : DEFAULT_TITLE.match),
      matchDetails: {
        opponent,
        homeAway: input.homeAway ?? "home",
        competition: input.competition ?? "friendly",
        meetTime: input.meetTime ? londonToUtc(input.date, input.meetTime) : start,
      },
    };
  }
  return { ...common, eventType: input.type, title: input.title.trim() || DEFAULT_TITLE[input.type] };
}

/** Turns a quick-add form with "repeat weekly until" set into a Series starting on its date. */
export function buildQuickSeries(input: QuickEventInput & { repeatUntil: string }): SeriesPattern {
  return {
    title: input.title.trim() || DEFAULT_TITLE.training,
    weekdays: [new Date(`${input.date}T12:00:00Z`).getUTCDay()],
    startTime: input.startTime,
    endTime: input.endTime,
    venue: input.venue.trim(),
    startDate: input.date,
    endDate: input.repeatUntil,
    notes: (input.notes ?? "").trim(),
    teamIds: input.teamIds ?? [],
  };
}
