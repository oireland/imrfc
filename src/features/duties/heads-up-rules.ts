// Heads-up rules: pure functions over plain data, no database or Next.js.
import { startsAt } from "@/features/events";
import { joinList } from "@/lib/text/join-names";
import { byStart, dutyUsers, heldBy, inStores, itemCount, needsUnit, uncovered, HOUR, type PlanEvent, type PlanEquipment } from "./plan";

/** A Duty still unfilled this close to its Event is worth a heads-up. */
const UNFILLED_WARNING_WINDOW = 48 * HOUR;

export type HeadsUp = {
  kind: "unfilled_duty" | "unavailable" | "pass_on";
  equipmentUnitId: string;
  eventIds: string[];
  message: string;
};

/** The Holder to name in a "needs to pass it on" message: whoever holds the most, other than the bringers. */
function otherHolder(unit: PlanEquipment, bringers: string[]): string | undefined {
  const others = unit.portions.filter((p) => p.holderId && !bringers.includes(p.holderId) && p.count > 0);
  if (others.length === 0) return undefined;
  return [...others].sort((a, b) => b.count - a.count)[0].holderId ?? undefined;
}

/**
 * Things about an Event's equipment plan worth a nudge that aren't Clashes: nobody carrying
 * equipment to or from an Event that's nearly here, equipment on the list that's Missing or
 * Retired, and equipment that must change hands before the Event because the person
 * bringing it can't get enough from Stores plus what they already hold. `events`
 * are the upcoming, uncancelled Events.
 */
export function findHeadsUps({
  now,
  equipment,
  events,
  personName,
}: {
  now: Date;
  equipment: PlanEquipment[];
  events: PlanEvent[];
  personName: (userId: string) => string;
}): HeadsUp[] {
  const headsUps: HeadsUp[] = [];
  const sorted = byStart(events);

  for (const unit of equipment) {
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
            equipmentUnitId: unit.id,
            eventIds: [next.id],
            message: `${personName(holder)} needs to pass ${unit.name} to ${joinList(bringers.map(personName))} before ${next.title}.`,
          });
        }
      }
    }

    if (unit.status !== "active") {
      for (const e of needing) {
        headsUps.push({
          kind: "unavailable",
          equipmentUnitId: unit.id,
          eventIds: [e.id],
          message: `${unit.name} is on the list for ${e.title} but has been ${unit.status === "missing" ? "marked missing" : "retired"}.`,
        });
      }
    }
  }

  for (const e of sorted) {
    const untilStart = startsAt(e).getTime() - now.getTime();
    if (untilStart < 0 || untilStart > UNFILLED_WARNING_WINDOW) continue;
    for (const { equipmentUnitId } of e.items) {
      const gaps = (["to", "from"] as const).map((direction) => ({
        direction,
        nobody: dutyUsers(e, equipmentUnitId, direction).length === 0,
        short: uncovered(e, equipmentUnitId, direction),
      }));
      if (gaps.every((g) => g.short === 0)) continue;
      const name = equipment.find((k) => k.id === equipmentUnitId)?.name ?? "equipment";
      const way = (direction: "to" | "from") => (direction === "to" ? "to" : "back from");
      const needed = itemCount(e, equipmentUnitId);
      const messages =
        gaps.every((g) => g.nobody)
          ? [`Nobody is taking ${name} to or back from ${e.title}`]
          : gaps
              .filter((g) => g.short > 0)
              .map((g) =>
                g.nobody
                  ? `Nobody is taking ${name} ${way(g.direction)} ${e.title}`
                  : `Only ${needed - g.short} of ${needed} ${name} are being taken ${way(g.direction)} ${e.title}`,
              );
      for (const message of messages) {
        headsUps.push({ kind: "unfilled_duty", equipmentUnitId, eventIds: [e.id], message: `${message}, and it starts within 48 hours.` });
      }
    }
  }

  return headsUps;
}
