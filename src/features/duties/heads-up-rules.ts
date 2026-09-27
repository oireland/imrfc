// Heads-up rules: pure functions over plain data, no database or Next.js.
import { joinNames } from "./names-rules";
import { byStart, dutyUsers, heldBy, inStores, itemCount, needsUnit, HOUR, type PlanEvent, type PlanKit } from "./plan";

/** A Duty still unfilled this close to its Event is worth a heads-up. */
const UNFILLED_WARNING_WINDOW = 48 * HOUR;

export type HeadsUp = {
  kind: "unfilled_duty" | "unavailable" | "pass_on";
  kitUnitId: string;
  eventIds: string[];
  message: string;
};

/** The Holder to name in a "needs to pass it on" message: whoever holds the most, other than the bringers. */
function otherHolder(unit: PlanKit, bringers: string[]): string | undefined {
  const others = unit.portions.filter((p) => p.holderId && !bringers.includes(p.holderId) && p.count > 0);
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
    const bringers = next ? dutyUsers(next, unit.id, "to") : [];
    if (bringers.length > 0) {
      const needed = itemCount(next, unit.id);
      // What all the bringers hold combined, plus what's in Stores.
      const available = bringers.reduce((sum, id) => sum + heldBy(unit, id), 0) + inStores(unit);
      if (available < needed) {
        const holder = otherHolder(unit, bringers);
        if (holder) {
          headsUps.push({
            kind: "pass_on",
            kitUnitId: unit.id,
            eventIds: [next.id],
            message: `${personName(holder)} needs to pass ${unit.name} to ${joinNames(bringers.map(personName))} before ${next.title}.`,
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
      const nobodyTo = dutyUsers(e, kitUnitId, "to").length === 0;
      const nobodyFrom = dutyUsers(e, kitUnitId, "from").length === 0;
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
