import type { Db } from "@/db/types";
import { getEvent, startsAt } from "@/features/events";
import type { Failure } from "@/lib/result";

/**
 * Why `viewer` can't change this Match's team now, or null when they can: they must be
 * Committee, and the Match must exist, not be Cancelled and not have started.
 * `notCommittee` is the caller's own message for a viewer who isn't Committee.
 */
export async function refuseMatchChange(
  db: Db,
  eventId: string,
  viewer: { committee: boolean },
  now: Date,
  notCommittee: string,
): Promise<Failure | null> {
  if (!viewer.committee) return { ok: false, error: notCommittee };
  const event = await getEvent(db, eventId);
  if (!event || event.eventType !== "match") return { ok: false, error: "That match doesn't exist." };
  if (event.cancelled) return { ok: false, error: "This match is cancelled." };
  if (startsAt(event) <= now) return { ok: false, error: "This match has already started." };
  return null;
}
