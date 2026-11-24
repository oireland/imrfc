// "I'll take 2 of the 4": a Person on a Duty may claim just some of the Checklist line's count.
// A Person with no number has all of it (how Duties worked before). Pure, no database.
import type { Result } from "@/lib/result";
import type { HolderPart } from "./confirm-source-rules";

/** `confirmed`: this Person has already marked their part as done (only when everyone gave a number). */
export type Share = { userId: string; count: number | null; confirmed?: boolean };

const everyoneGaveANumber = (shares: Share[]) => shares.length > 0 && shares.every((s) => s.count !== null);

/** How many of the line nobody has claimed yet; nothing once someone is on it without a number. */
export function unclaimed(total: number, shares: Share[]): number {
  if (shares.some((s) => s.count === null)) return 0;
  return Math.max(0, total - shares.reduce((sum, s) => sum + (s.count ?? 0), 0));
}

/** What Confirming moves: just what's claimed when everyone gave a number, else the whole line. */
export function countToMove(total: number, shares: Share[]): number {
  return everyoneGaveANumber(shares) ? shares.reduce((sum, s) => sum + (s.count ?? 0), 0) : total;
}

/** Who ends up holding how many, when everyone gave a number — otherwise Confirming has to ask. */
export function holdersFromShares(shares: Share[]): HolderPart[] | undefined {
  return everyoneGaveANumber(shares) ? shares.map((s) => ({ userId: s.userId, count: s.count! })) : undefined;
}

export function validateShare(total: number, shares: Share[], count: number): Result {
  if (!Number.isInteger(count) || count < 1) return { ok: false, error: "Take at least 1." };
  const left = unclaimed(total, shares);
  if (count > left) return { ok: false, error: left === 0 ? "There's none left to take." : `Only ${left} left to take.` };
  return { ok: true };
}

/** What a Confirm would act on now: when everyone gave a number, only those not already done; otherwise everyone. */
export function pendingShares(shares: Share[]): Share[] {
  return everyoneGaveANumber(shares) ? shares.filter((s) => !s.confirmed) : shares;
}

/** A whole set of shares (Committee setting who takes how many): whole numbers from 1, adding up to no more than the line. */
export function validateShares(total: number, shares: Share[]): Result {
  if (shares.some((s) => s.count !== null && (!Number.isInteger(s.count) || s.count < 1))) return { ok: false, error: "Take at least 1." };
  if (everyoneGaveANumber(shares) && shares.reduce((sum, s) => sum + (s.count ?? 0), 0) > total) {
    return { ok: false, error: `That's more than the ${total} needed.` };
  }
  return { ok: true };
}
