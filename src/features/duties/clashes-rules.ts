// Clash rules: pure functions over plain data, no database or Next.js.
import { byStart, dutyUser, HOUR, type PlanEvent, type PlanKit } from "./plan";

/** Events closer together than this count as back-to-back. */
const BACK_TO_BACK_GAP = 2 * HOUR;

export type Clash = {
  kind: "overlap" | "back_to_back";
  kitUnitId: string;
  eventIds: string[];
  message: string;
};

/**
 * A Kit Unit needed at two Events that overlap, or that are back-to-back with nobody
 * taking it away from the first. Warnings only: a Clash never blocks anything.
 * `events` are the upcoming, uncancelled Events.
 */
export function findClashes({ kit, events }: { kit: PlanKit[]; events: PlanEvent[] }): Clash[] {
  const clashes: Clash[] = [];
  const sorted = byStart(events);

  for (const unit of kit) {
    const needing = sorted.filter((e) => e.kitUnitIds.includes(unit.id));

    for (let i = 0; i + 1 < needing.length; i++) {
      const [a, b] = [needing[i], needing[i + 1]];
      const gap = b.start.getTime() - a.end.getTime();
      if (gap < 0) {
        clashes.push({
          kind: "overlap",
          kitUnitId: unit.id,
          eventIds: [a.id, b.id],
          message: `${a.title} and ${b.title} overlap, and both need ${unit.name}.`,
        });
      } else if (gap < BACK_TO_BACK_GAP && !dutyUser(a, unit.id, "from")) {
        clashes.push({
          kind: "back_to_back",
          kitUnitId: unit.id,
          eventIds: [a.id, b.id],
          message: `${b.title} starts straight after ${a.title} and both need ${unit.name}, but nobody is taking ${unit.name} away from ${a.title} yet.`,
        });
      }
    }
  }

  return clashes;
}
