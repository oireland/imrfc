// The equipment plan as the Clash and heads-up rules see it: plain data, no database or Next.js.

export type PlanPortion = { storeId: string | null; holderId: string | null; count: number };

export type PlanEquipment = {
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
  /** The Event's resolved Checklist: each Equipment Unit it needs, with its effective count. */
  items: { equipmentUnitId: string; count: number }[];
  duties: { equipmentUnitId: string; direction: "to" | "from"; userIds: string[] }[];
};

export const HOUR = 60 * 60 * 1000;

/** Everyone on the Duty for this Equipment Unit and direction (empty when nobody is). */
export const dutyUsers = (e: PlanEvent, equipmentUnitId: string, direction: "to" | "from") =>
  e.duties.find((d) => d.equipmentUnitId === equipmentUnitId && d.direction === direction)?.userIds ?? [];

/** The count a Checklist line asks the Event for, or 0 if the Equipment Unit isn't on it. */
export const itemCount = (e: PlanEvent, equipmentUnitId: string) =>
  e.items.find((i) => i.equipmentUnitId === equipmentUnitId)?.count ?? 0;

export const needsUnit = (e: PlanEvent, equipmentUnitId: string) => e.items.some((i) => i.equipmentUnitId === equipmentUnitId);

export const byStart = (events: PlanEvent[]) => [...events].sort((a, b) => a.start.getTime() - b.start.getTime());

/** How much of an Equipment Unit a User currently holds. */
export const heldBy = (unit: PlanEquipment, userId: string) =>
  unit.portions.filter((p) => p.holderId === userId).reduce((sum, p) => sum + p.count, 0);

/** How much of an Equipment Unit is currently at any Store. */
export const inStores = (unit: PlanEquipment) =>
  unit.portions.filter((p) => p.storeId !== null).reduce((sum, p) => sum + p.count, 0);
