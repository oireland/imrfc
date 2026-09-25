// The kit plan as the Clash and heads-up rules see it: plain data, no database or Next.js.

export type PlanKit = {
  id: string;
  name: string;
  status: "active" | "missing" | "retired";
  holderId: string | null;
};

export type PlanEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  kitUnitIds: string[];
  duties: { kitUnitId: string; direction: "to" | "from"; userId: string | null }[];
};

export const HOUR = 60 * 60 * 1000;

export const dutyUser = (e: PlanEvent, kitUnitId: string, direction: "to" | "from") =>
  e.duties.find((d) => d.kitUnitId === kitUnitId && d.direction === direction)?.userId ?? null;

export const byStart = (events: PlanEvent[]) => [...events].sort((a, b) => a.start.getTime() - b.start.getTime());
