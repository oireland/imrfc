import type { Competition, EventType, HomeAway, NewEvent } from "./rules";
import type { SeriesPattern } from "./series-rules";
import { addDays, londonToUtc } from "@/lib/london";

export type QuickEventInput = {
  date: string; // YYYY-MM-DD, London
  startTime: string; // HH:MM, London; a Match's kick-off, which is ignored when `kickoffTbc`
  endTime?: string; // HH:MM, London; Training and Social only, a Match runs two hours
  type: EventType;
  title?: string; // Social only; every other Event is titled from its details
  venue: string;
  kickoffTbc?: boolean; // Matches only
  teamId?: string; // Matches only
  opponent?: string; // Matches only
  homeAway?: HomeAway;
  competition?: Competition;
  meetTime?: string; // HH:MM, London; Matches only, blank means TBC
  travelMeetTime?: string; // HH:MM, London; Matches only, blank means TBC
  travelMeetPoint?: string; // Matches only
  schedule?: string; // Matches only, for the Team Sheet
  travelAttire?: string;
  warmUpAttire?: string;
  postMatchActivity?: string;
  notes?: string;
  repeatUntil?: string; // YYYY-MM-DD, London; Training and Social only — repeat weekly on this day up to and including this date
};

const MATCH_LENGTH_MS = 2 * 60 * 60 * 1000;

/**
 * Turns the quick-add form into a NewEvent. Times are London wall clock; an end time before
 * the start time means the Event runs past midnight. A Match ends two hours after kick-off, and
 * while its kick-off is TBC it just covers the day.
 */
export function buildQuickEvent(input: QuickEventInput): NewEvent {
  const common = { venue: input.venue.trim(), notes: (input.notes ?? "").trim() };

  if (input.type === "match") {
    const tbc = !!input.kickoffTbc;
    const start = londonToUtc(input.date, tbc ? "00:00" : input.startTime);
    const end = tbc ? londonToUtc(input.date, "23:59") : new Date(start.getTime() + MATCH_LENGTH_MS);
    const at = (time?: string) => (time ? londonToUtc(input.date, time) : undefined);
    const meetTime = at(input.meetTime);
    const travelMeetTime = at(input.travelMeetTime);
    return {
      ...common,
      eventType: "match",
      start,
      end,
      ...(tbc && { startTbc: true }),
      matchDetails: {
        teamId: input.teamId ?? "",
        opponent: (input.opponent ?? "").trim(),
        homeAway: input.homeAway ?? "home",
        competition: input.competition ?? "friendly",
        ...(meetTime && { meetTime }),
        ...(travelMeetTime && { travelMeetTime }),
        ...(input.travelMeetPoint?.trim() && { travelMeetPoint: input.travelMeetPoint.trim() }),
        schedule: input.schedule,
        travelAttire: input.travelAttire,
        warmUpAttire: input.warmUpAttire,
        postMatchActivity: input.postMatchActivity,
      },
    };
  }

  const start = londonToUtc(input.date, input.startTime);
  const endTime = input.endTime ?? input.startTime;
  let end = londonToUtc(input.date, endTime);
  if (end < start) {
    end = londonToUtc(addDays(input.date, 1), endTime);
  }
  if (input.type === "social") return { ...common, eventType: "social", title: (input.title ?? "").trim(), start, end };
  return { ...common, eventType: "training", start, end };
}

/** Turns a quick-add form with "repeat weekly until" set into a Series starting on its date. */
export function buildQuickSeries(
  input: QuickEventInput & { repeatUntil: string; type: "training" | "social" },
): SeriesPattern {
  return {
    ...(input.type === "social" && { title: (input.title ?? "").trim() }),
    eventType: input.type,
    weekdays: [new Date(`${input.date}T12:00:00Z`).getUTCDay()],
    startTime: input.startTime,
    endTime: input.endTime ?? input.startTime,
    venue: input.venue.trim(),
    startDate: input.date,
    endDate: input.repeatUntil,
    notes: (input.notes ?? "").trim(),
  };
}
