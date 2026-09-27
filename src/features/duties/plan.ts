// The kit plan as the Clash and heads-up rules see it: plain data, no database or Next.js.

export type PlanPortion = { storeId: string | null; holderId: string | null; count: number };

export type PlanKit = {
  id: string;
  name: string;
  status: "active" | "missing" | "retired";
  quantity: number;
  /** Where it is now, split by Place (Stores and Holders only — Unconfirmed doesn't count as available). */
  portions: PlanPortion[];
};

export type PlanEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  /** The Event's resolved Checklist: each Kit Unit it needs, with its effective count. */
  items: { kitUnitId: string; count: number }[];
  duties: { kitUnitId: string; direction: "to" | "from"; userId: string | null }[];
};

export const HOUR = 60 * 60 * 1000;

export const dutyUser = (e: PlanEvent, kitUnitId: string, direction: "to" | "from") =>
  e.duties.find((d) => d.kitUnitId === kitUnitId && d.direction === direction)?.userId ?? null;

/** The count a Checklist line asks the Event for, or 0 if the Kit Unit isn't on it. */
export const itemCount = (e: PlanEvent, kitUnitId: string) =>
  e.items.find((i) => i.kitUnitId === kitUnitId)?.count ?? 0;

export const needsUnit = (e: PlanEvent, kitUnitId: string) => e.items.some((i) => i.kitUnitId === kitUnitId);

export const byStart = (events: PlanEvent[]) => [...events].sort((a, b) => a.start.getTime() - b.start.getTime());

/** How much of a Kit Unit a User currently holds. */
export const heldBy = (unit: PlanKit, userId: string) =>
  unit.portions.filter((p) => p.holderId === userId).reduce((sum, p) => sum + p.count, 0);

/** How much of a Kit Unit is currently at any Store. */
export const inStores = (unit: PlanKit) =>
  unit.portions.filter((p) => p.storeId !== null).reduce((sum, p) => sum + p.count, 0);
