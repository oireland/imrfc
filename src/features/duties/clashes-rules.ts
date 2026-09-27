// Clash rules: pure functions over plain data, no database or Next.js.
import { byStart, dutyUser, itemCount, needsUnit, HOUR, type PlanEvent, type PlanKit } from "./plan";

/** Events closer together than this count as back-to-back. */
const BACK_TO_BACK_GAP = 2 * HOUR;

export type Clash = {
  kind: "overlap" | "back_to_back";
  kitUnitId: string;
  eventIds: string[];
  message: string;
};

const overlaps = (a: PlanEvent, b: PlanEvent) => a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();

function joinTitles(titles: string[]): string {
  if (titles.length <= 2) return titles.join(" and ");
  return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}

function overlapMessage(unit: PlanKit, events: PlanEvent[], total: number): string {
  const titles = events.map((e) => e.title);
  if (unit.quantity === 1) {
    const need = titles.length === 2 ? "both" : "all";
    return `${joinTitles(titles)} overlap, and ${need} need ${unit.name}.`;
  }
  return `${joinTitles(titles)} need ${total} ${unit.name} between them, but the club only has ${unit.quantity}.`;
}

function backToBackMessage(unit: PlanKit, a: PlanEvent, b: PlanEvent, total: number): string {
  if (unit.quantity === 1) {
    return `${b.title} starts straight after ${a.title} and both need ${unit.name}, but nobody is taking ${unit.name} away from ${a.title} yet.`;
  }
  return `${b.title} starts straight after ${a.title} and they need ${total} ${unit.name} between them, but the club only has ${unit.quantity}, and nobody is taking ${unit.name} away from ${a.title} yet.`;
}

/**
 * A Kit Unit needed at Events that overlap, or that are back-to-back with nobody
 * taking it away from the first, whose counts between them add up to more than its
 * Quantity. Warnings only: a Clash never blocks anything. `events` are the upcoming,
 * uncancelled Events.
 */
export function findClashes({ kit, events }: { kit: PlanKit[]; events: PlanEvent[] }): Clash[] {
  const clashes: Clash[] = [];
  const sorted = byStart(events);

  for (const unit of kit) {
    const needing = sorted.filter((e) => needsUnit(e, unit.id));

    // Overlap: sweep sorted-by-start Events into maximal mutually-overlapping groups
    // (interval merging), and flag any group whose combined count exceeds the Quantity.
    let group: PlanEvent[] = [];
    let groupEnd = -Infinity;
    const flushGroup = () => {
      if (group.length < 2) return;
      const total = group.reduce((sum, e) => sum + itemCount(e, unit.id), 0);
      if (total > unit.quantity) {
        clashes.push({
          kind: "overlap",
          kitUnitId: unit.id,
          eventIds: group.map((e) => e.id),
          message: overlapMessage(unit, group, total),
        });
      }
    };
    for (const e of needing) {
      if (group.length > 0 && e.start.getTime() < groupEnd) {
        group.push(e);
        groupEnd = Math.max(groupEnd, e.end.getTime());
      } else {
        flushGroup();
        group = [e];
        groupEnd = e.end.getTime();
      }
    }
    flushGroup();

    // Back-to-back: adjacent pairs only, as today — only when the first's From Duty is unfilled.
    for (let i = 0; i + 1 < needing.length; i++) {
      const [a, b] = [needing[i], needing[i + 1]];
      if (overlaps(a, b)) continue; // already covered above
      const gap = b.start.getTime() - a.end.getTime();
      if (gap >= BACK_TO_BACK_GAP || dutyUser(a, unit.id, "from")) continue;
      const total = itemCount(a, unit.id) + itemCount(b, unit.id);
      if (total > unit.quantity) {
        clashes.push({
          kind: "back_to_back",
          kitUnitId: unit.id,
          eventIds: [a.id, b.id],
          message: backToBackMessage(unit, a, b, total),
        });
      }
    }
  }

  return clashes;
}
