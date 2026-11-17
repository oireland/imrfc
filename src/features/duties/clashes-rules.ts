// Clash rules: pure functions over plain data, no database or Next.js.
import { joinList } from "@/lib/join-names";
import { byStart, dutyUsers, itemCount, needsUnit, HOUR, type PlanEvent, type PlanEquipment } from "./plan";

/** Events closer together than this count as back-to-back. */
const BACK_TO_BACK_GAP = 2 * HOUR;

export type Clash = {
  kind: "overlap" | "back_to_back";
  equipmentUnitId: string;
  eventIds: string[];
  message: string;
};

function overlapMessage(unit: PlanEquipment, events: PlanEvent[], total: number): string {
  const titles = events.map((e) => e.title);
  if (unit.quantity === 1) {
    const need = titles.length === 2 ? "both" : "all";
    return `${joinList(titles, "and")} overlap, and ${need} need ${unit.name}.`;
  }
  return `${joinList(titles, "and")} need ${total} ${unit.name} between them, but the club only has ${unit.quantity}.`;
}

function backToBackMessage(unit: PlanEquipment, a: PlanEvent, b: PlanEvent, total: number): string {
  if (unit.quantity === 1) {
    return `${b.title} starts straight after ${a.title} and both need ${unit.name}, but nobody is taking ${unit.name} away from ${a.title} yet.`;
  }
  return `${b.title} starts straight after ${a.title} and they need ${total} ${unit.name} between them, but the club only has ${unit.quantity}, and nobody is taking ${unit.name} away from ${a.title} yet.`;
}

/**
 * An Equipment Unit needed at Events that overlap, or that are back-to-back with nobody
 * taking it away from the first, whose counts between them add up to more than its
 * Quantity. Warnings only: a Clash never blocks anything. `events` are the upcoming,
 * uncancelled Events.
 */
export function findClashes({ equipment, events }: { equipment: PlanEquipment[]; events: PlanEvent[] }): Clash[] {
  const clashes: Clash[] = [];
  const sorted = byStart(events);

  for (const unit of equipment) {
    const needing = sorted.filter((e) => needsUnit(e, unit.id));

    // Overlap: sweep sorted-by-start Events, tracking those on at the same moment. Just
    // before one ends the set is at its largest, so flag it if it needs over the Quantity.
    let onNow: PlanEvent[] = [];
    const flushOnNow = () => {
      if (onNow.length < 2) return;
      const total = onNow.reduce((sum, e) => sum + itemCount(e, unit.id), 0);
      if (total > unit.quantity) {
        clashes.push({
          kind: "overlap",
          equipmentUnitId: unit.id,
          eventIds: onNow.map((e) => e.id),
          message: overlapMessage(unit, onNow, total),
        });
      }
    };
    for (const e of needing) {
      const stillOn = onNow.filter((other) => other.end.getTime() > e.start.getTime());
      if (stillOn.length < onNow.length) flushOnNow();
      onNow = [...stillOn, e];
    }
    flushOnNow();

    // Back-to-back: each Event against the one that finished last before it started, which
    // needn't be its neighbour by start time. Only when that one's From Duty is unfilled.
    for (const b of needing) {
      const a = needing
        .filter((other) => other.end.getTime() <= b.start.getTime())
        .reduce<PlanEvent | undefined>((latest, other) => (!latest || other.end > latest.end ? other : latest), undefined);
      if (!a) continue;
      const gap = b.start.getTime() - a.end.getTime();
      if (gap >= BACK_TO_BACK_GAP || dutyUsers(a, unit.id, "from").length > 0) continue;
      const total = itemCount(a, unit.id) + itemCount(b, unit.id);
      if (total > unit.quantity) {
        clashes.push({
          kind: "back_to_back",
          equipmentUnitId: unit.id,
          eventIds: [a.id, b.id],
          message: backToBackMessage(unit, a, b, total),
        });
      }
    }
  }

  return clashes;
}
