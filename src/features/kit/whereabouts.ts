import type { kitUnit } from "./schema";

type KitUnit = typeof kitUnit.$inferSelect;

export type WhereaboutsGroup =
  | { type: "store"; storeId: string; units: KitUnit[] }
  | { type: "holder"; holderId: string; units: KitUnit[] };

/** Groups Active Kit Units by Whereabouts: each Store, then each Holder. */
export function groupByWhereabouts(units: KitUnit[]): WhereaboutsGroup[] {
  const stores = new Map<string, KitUnit[]>();
  const holders = new Map<string, KitUnit[]>();

  for (const unit of units) {
    if (unit.whereaboutsType === "store" && unit.storeId) {
      stores.set(unit.storeId, [...(stores.get(unit.storeId) ?? []), unit]);
    } else if (unit.whereaboutsType === "holder" && unit.holderId) {
      holders.set(unit.holderId, [...(holders.get(unit.holderId) ?? []), unit]);
    }
  }

  return [
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
  ];
}
