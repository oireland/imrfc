import { addDays, formatDay } from "@/lib/day-string";

/** A dated period a Player won't be playing for a non-injury reason. Dates are London calendar days, `YYYY-MM-DD`. */
export type AwayPeriod = {
  id: string;
  userId: string;
  from: string;
  until: string;
  reason: string;
  /** Who added it: the Player themself, or the Committee member who did it for them. */
  setById: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AwayInput = { from: string; until: string; reason: string };

/** "20 Dec – 5 Jan", or just "3 Nov" for a single day. */
export function rangeLabel(from: string, until: string): string {
  return from === until ? formatDay(from) : `${formatDay(from)} – ${formatDay(until)}`;
}

/** A period to save: both dates (so it ends by itself), a Reason, and not wholly in the past. */
export function validateAway(input: AwayInput, today: string): { ok: true; value: AwayInput } | { ok: false; error: string } {
  const reason = input.reason.trim();
  if (!input.from) return { ok: false, error: "Pick the day you go away." };
  if (!input.until) return { ok: false, error: "Pick the day you'll be back." };
  if (input.until < input.from) return { ok: false, error: "You can't be back before you go." };
  if (input.until < today) return { ok: false, error: "That's already over." };
  if (!reason) return { ok: false, error: "Say why you'll be away." };
  return { ok: true, value: { from: input.from, until: input.until, reason } };
}

export type AwayState = "past" | "current" | "future";

export function periodState(period: Pick<AwayPeriod, "from" | "until">, today: string): AwayState {
  if (period.until < today) return "past";
  return period.from > today ? "future" : "current";
}

/** Periods split by where they stand today: future soonest first, past latest first. */
export function groupAway<P extends Pick<AwayPeriod, "from" | "until">>(periods: P[], today: string): { current: P[]; future: P[]; past: P[] } {
  const inState = (state: AwayState) => periods.filter((p) => periodState(p, today) === state);
  return {
    current: inState("current").sort((a, b) => a.from.localeCompare(b.from)),
    future: inState("future").sort((a, b) => a.from.localeCompare(b.from)),
    past: inState("past").sort((a, b) => b.until.localeCompare(a.until)),
  };
}

/** The new `until` for "I'm back". */
export function imBackUntil(today: string): string {
  return addDays(today, -1);
}

/** For the Players list: "Away until 3 Nov" while Away, else "Away from 20 Dec" for the next one coming. */
export function awayLabel(periods: Pick<AwayPeriod, "from" | "until">[], today: string): string | null {
  const { current, future } = groupAway(periods, today);
  if (current.length > 0) return `Away until ${formatDay(current.map((p) => p.until).sort().at(-1)!)}`;
  if (future.length > 0) return `Away from ${formatDay(future[0].from)}`;
  return null;
}

/** How soon an Away period must start for Committee to be pushed about it. */
const PUSH_WITHIN_DAYS = 14;

/**
 * What to push Committee when a period is added: the name and state only, since push shows on lock
 * screens. Null when it starts further off than 14 days.
 */
export function awayPushMessage(input: { name: string; from: string; until: string }, today: string): string | null {
  if (input.from > addDays(today, PUSH_WITHIN_DAYS)) return null;
  return input.from <= today
    ? `${input.name} is away until ${formatDay(input.until)}`
    : `${input.name} will be away from ${formatDay(input.from)}`;
}

export { addDays, formatDay, londonToday } from "@/lib/day-string";
