// Clash rules: pure functions over plain data, no database or Next.js.

const HOUR = 60 * 60 * 1000;
/** Events closer together than this count as back-to-back. */
const BACK_TO_BACK_GAP = 2 * HOUR;
/** A Duty still unfilled this close to its Event is worth a warning. */
const UNFILLED_WARNING_WINDOW = 48 * HOUR;

export type ClashKit = {
  id: string;
  name: string;
  status: "active" | "missing" | "retired";
  holderId: string | null;
};

export type ClashEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  kitUnitIds: string[];
  duties: { kitUnitId: string; direction: "to" | "from"; userId: string | null }[];
};

export type Clash = {
  kind: "overlap" | "back_to_back" | "holder_without_duty" | "unavailable" | "unfilled_duty";
  kitUnitId: string;
  eventIds: string[];
  direction?: "to" | "from";
  message: string;
};

const dutyUser = (e: ClashEvent, kitUnitId: string, direction: "to" | "from") =>
  e.duties.find((d) => d.kitUnitId === kitUnitId && d.direction === direction)?.userId ?? null;

/** Warnings only: a Clash never blocks anything. `events` are the upcoming, uncancelled Events. */
export function findClashes({ now, kit, events }: { now: Date; kit: ClashKit[]; events: ClashEvent[] }): Clash[] {
  const clashes: Clash[] = [];
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());

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
          message: `${unit.name} is needed at ${a.title} and ${b.title}, which overlap.`,
        });
      } else if (gap < BACK_TO_BACK_GAP && !dutyUser(a, unit.id, "from")) {
        clashes.push({
          kind: "back_to_back",
          kitUnitId: unit.id,
          eventIds: [a.id, b.id],
          message: `${unit.name} is needed at ${a.title} and straight after at ${b.title}, with no From Duty in between.`,
        });
      }
    }

    const next = needing[0];
    if (unit.holderId && next && dutyUser(next, unit.id, "to") !== unit.holderId) {
      clashes.push({
        kind: "holder_without_duty",
        kitUnitId: unit.id,
        eventIds: [next.id],
        message: `${unit.name}'s Holder has no To Duty for ${next.title}.`,
      });
    }

    if (unit.status !== "active") {
      for (const e of needing) {
        clashes.push({
          kind: "unavailable",
          kitUnitId: unit.id,
          eventIds: [e.id],
          message: `${unit.name} is ${unit.status === "missing" ? "Missing" : "Retired"} but is on the Checklist for ${e.title}.`,
        });
      }
    }
  }

  for (const e of sorted) {
    const untilStart = e.start.getTime() - now.getTime();
    if (untilStart < 0 || untilStart > UNFILLED_WARNING_WINDOW) continue;
    for (const kitUnitId of e.kitUnitIds) {
      for (const direction of ["to", "from"] as const) {
        if (dutyUser(e, kitUnitId, direction)) continue;
        const name = kit.find((k) => k.id === kitUnitId)?.name ?? kitUnitId;
        clashes.push({
          kind: "unfilled_duty",
          kitUnitId,
          eventIds: [e.id],
          direction,
          message: `${name}'s ${direction === "to" ? "To" : "From"} Duty for ${e.title} is unfilled and the Event is within 48 hours.`,
        });
      }
    }
  }

  return clashes;
}
