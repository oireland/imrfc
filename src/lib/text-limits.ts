/** How long user-typed free text may be. Generous for real use, small enough to stop abuse. */
export const LIMITS = {
  /** Names and titles: a person, team, store, piece of equipment, opponent. */
  name: 100,
  /** One-line details: venue, address, reason, schedule, attire. */
  line: 200,
  /** Notes and descriptions. */
  note: 1000,
} as const;

/** `[what it is, the value, the limit]`. Missing values are fine. */
export type LengthCheck = readonly [label: string, value: string | null | undefined, max: number];

/** A friendly error for the first field that is over its limit, or null when they all fit. */
export function firstTooLong(checks: readonly LengthCheck[]): string | null {
  for (const [label, value, max] of checks) {
    if (value && value.trim().length > max) return `The ${label} is too long. Keep it to ${max} characters or fewer.`;
  }
  return null;
}
