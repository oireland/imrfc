import type { Competition, EventType, HomeAway, NewEvent } from "./rules";
import { londonToUtc } from "./series-rules";

export type QuickEventInput = {
  date: string; // YYYY-MM-DD, London
  startTime: string; // HH:MM, London
  endTime: string;
  type: EventType;
  title: string;
  venueId: string;
  opponent?: string;
  homeAway?: HomeAway;
  competition?: Competition;
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
  const common = { start, end, venueId: input.venueId };

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
        meetTime: start,
      },
    };
  }
  return { ...common, eventType: input.type, title: input.title.trim() || DEFAULT_TITLE[input.type] };
}
