import type { kitUnit } from "./schema";

type KitUnit = typeof kitUnit.$inferSelect;

export type WhereaboutsGroup =
  | { type: "store"; storeId: string; units: KitUnit[] }
  | { type: "holder"; holderId: string; units: KitUnit[] }
  | { type: "unconfirmed"; units: KitUnit[] };

/**
 * Groups Active Kit Units by Whereabouts: what the viewer holds, then each Store, each other Holder,
 * then Unconfirmed.
 */
export function groupByWhereabouts(units: KitUnit[], viewerId?: string): WhereaboutsGroup[] {
  const stores = new Map<string, KitUnit[]>();
  const holders = new Map<string, KitUnit[]>();
  const unconfirmed: KitUnit[] = [];

  for (const unit of units) {
    if (unit.whereaboutsType === "store" && unit.storeId) {
      stores.set(unit.storeId, [...(stores.get(unit.storeId) ?? []), unit]);
    } else if (unit.whereaboutsType === "holder" && unit.holderId) {
      holders.set(unit.holderId, [...(holders.get(unit.holderId) ?? []), unit]);
    } else if (unit.whereaboutsType === "unconfirmed") {
      unconfirmed.push(unit);
    }
  }

  const viewerUnits = viewerId ? holders.get(viewerId) : undefined;
  if (viewerId) holders.delete(viewerId);

  return [
    ...(viewerUnits ? [{ type: "holder" as const, holderId: viewerId!, units: viewerUnits }] : []),
    ...[...stores.entries()].map(([storeId, group]) => ({
      type: "store" as const,
      storeId,
      units: group,
    })),
    ...[...holders.entries()].map(([holderId, group]) => ({
      type: "holder" as const,
      holderId,
      units: group,
    })),
    ...(unconfirmed.length > 0 ? [{ type: "unconfirmed" as const, units: unconfirmed }] : []),
  ];
}

export type QuickMove = { type: "store"; storeId: string } | { type: "holder"; holderId: string };

/** The one-tap Move offered on the Kit view: return a Kit Unit I hold to its Home, otherwise "I've got it". */
export function quickMoveFor(unit: KitUnit, userId: string): QuickMove {
  if (unit.whereaboutsType === "holder" && unit.holderId === userId) {
    return { type: "store", storeId: unit.homeId };
  }
  return { type: "holder", holderId: userId };
}
