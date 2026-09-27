// Heads-up rules: pure functions over plain data, no database or Next.js.
import { byStart, dutyUser, heldBy, inStores, itemCount, needsUnit, HOUR, type PlanEvent, type PlanKit } from "./plan";

/** A Duty still unfilled this close to its Event is worth a heads-up. */
const UNFILLED_WARNING_WINDOW = 48 * HOUR;

export type HeadsUp = {
  kind: "unfilled_duty" | "unavailable" | "pass_on";
  kitUnitId: string;
  eventIds: string[];
  message: string;
};

/** The Holder to name in a "needs to pass it on" message: whoever holds the most, other than the bringer. */
function otherHolder(unit: PlanKit, bringer: string): string | undefined {
  const others = unit.portions.filter((p) => p.holderId && p.holderId !== bringer && p.count > 0);
  if (others.length === 0) return undefined;
  return [...others].sort((a, b) => b.count - a.count)[0].holderId ?? undefined;
}

/**
 * Things about an Event's kit plan worth a nudge that aren't Clashes: nobody carrying
 * kit to or from an Event that's nearly here, kit on the list that's Missing or
 * Retired, and kit that must change hands before the Event because the person
 * bringing it can't get enough from Stores plus what they already hold. `events`
 * are the upcoming, uncancelled Events.
 */
export function findHeadsUps({
  now,
  kit,
  events,
  personName,
}: {
  now: Date;
  kit: PlanKit[];
  events: PlanEvent[];
  personName: (userId: string) => string;
}): HeadsUp[] {
  const headsUps: HeadsUp[] = [];
  const sorted = byStart(events);

  for (const unit of kit) {
    const needing = sorted.filter((e) => needsUnit(e, unit.id));

    const next = needing[0];
    const bringer = next && dutyUser(next, unit.id, "to");
    if (bringer) {
      const needed = itemCount(next, unit.id);
      const available = heldBy(unit, bringer) + inStores(unit);
      if (available < needed) {
        const holder = otherHolder(unit, bringer);
        if (holder) {
          headsUps.push({
            kind: "pass_on",
            kitUnitId: unit.id,
            eventIds: [next.id],
            message: `${personName(holder)} needs to pass ${unit.name} to ${personName(bringer)} before ${next.title}.`,
          });
        }
      }
    }

    if (unit.status !== "active") {
      for (const e of needing) {
        headsUps.push({
          kind: "unavailable",
          kitUnitId: unit.id,
          eventIds: [e.id],
          message: `${unit.name} is on the list for ${e.title} but has been ${unit.status === "missing" ? "marked missing" : "retired"}.`,
        });
      }
    }
  }

  for (const e of sorted) {
    const untilStart = e.start.getTime() - now.getTime();
    if (untilStart < 0 || untilStart > UNFILLED_WARNING_WINDOW) continue;
    for (const { kitUnitId } of e.items) {
      const nobodyTo = !dutyUser(e, kitUnitId, "to");
      const nobodyFrom = !dutyUser(e, kitUnitId, "from");
      if (!nobodyTo && !nobodyFrom) continue;
      const name = kit.find((k) => k.id === kitUnitId)?.name ?? "kit";
      const way = nobodyTo && nobodyFrom ? "to or back from" : nobodyTo ? "to" : "back from";
      headsUps.push({
        kind: "unfilled_duty",
        kitUnitId,
        eventIds: [e.id],
        message: `Nobody is taking ${name} ${way} ${e.title}, and it starts within 48 hours.`,
      });
    }
  }

  return headsUps;
}
