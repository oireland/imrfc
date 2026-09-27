import type { kitUnit } from "./schema";
import type { Place, Portion } from "./portions";

type KitUnit = typeof kitUnit.$inferSelect;

/** One Kit Unit's Portion at a Place, as the Kit view shows it: a row within a group. */
export type KitRow = { unit: KitUnit; portion: Portion };

export type WhereaboutsGroup =
  | { type: "store"; storeId: string; rows: KitRow[] }
  | { type: "holder"; holderId: string; rows: KitRow[] }
  | { type: "unconfirmed"; rows: KitRow[] };

/**
 * Groups Active Kit Units' Portions by Whereabouts: what the viewer holds, then each
 * Store, each other Holder, then Unconfirmed. A split Kit Unit appears once per group,
 * with its count there.
 */
export function groupByWhereabouts(rows: KitRow[], viewerId?: string): WhereaboutsGroup[] {
  const stores = new Map<string, KitRow[]>();
  const holders = new Map<string, KitRow[]>();
  const unconfirmed: KitRow[] = [];

  for (const row of rows) {
    const { portion } = row;
    if (portion.whereaboutsType === "store" && portion.storeId) {
      stores.set(portion.storeId, [...(stores.get(portion.storeId) ?? []), row]);
    } else if (portion.whereaboutsType === "holder" && portion.holderId) {
      holders.set(portion.holderId, [...(holders.get(portion.holderId) ?? []), row]);
    } else if (portion.whereaboutsType === "unconfirmed") {
      unconfirmed.push(row);
    }
  }

  const viewerRows = viewerId ? holders.get(viewerId) : undefined;
  if (viewerId) holders.delete(viewerId);

  return [
    ...(viewerRows ? [{ type: "holder" as const, holderId: viewerId!, rows: viewerRows }] : []),
    ...[...stores.entries()].map(([storeId, group]) => ({
      type: "store" as const,
      storeId,
      rows: group,
    })),
    ...[...holders.entries()].map(([holderId, group]) => ({
      type: "holder" as const,
      holderId,
      rows: group,
    })),
    ...(unconfirmed.length > 0 ? [{ type: "unconfirmed" as const, rows: unconfirmed }] : []),
  ];
}

export type QuickMoveTarget = { type: "store"; storeId: string } | { type: "holder"; holderId: string };
export type QuickMove = { count: number; from: Place; to: QuickMoveTarget };

function placeOf(portion: Portion): Place {
  if (portion.whereaboutsType === "store") return { type: "store", storeId: portion.storeId! };
  if (portion.whereaboutsType === "holder") return { type: "holder", holderId: portion.holderId! };
  return { type: "unconfirmed", lastSeenEventId: portion.lastSeenEventId! };
}

/** The one-tap Move offered on a Portion row: return a Kit Unit I hold to its Home, otherwise "I've got it". */
export function quickMoveFor(row: KitRow, userId: string): QuickMove {
  const { unit, portion } = row;
  const from = placeOf(portion);
  if (portion.whereaboutsType === "holder" && portion.holderId === userId) {
    return { count: portion.count, from, to: { type: "store", storeId: unit.homeId } };
  }
  return { count: portion.count, from, to: { type: "holder", holderId: userId } };
}

export type WhereaboutsNames = {
  storeName: (storeId: string) => string;
  personName: (holderId: string) => string;
  eventName: (eventId: string) => string;
};

/**
 * A Kit Unit's Whereabouts as a sentence for its detail page: "In the Shed" when it's
 * all in one place, or "4 at the Shed · 4 with Sam" when it's split.
 */
export function describeWhereabouts(portions: Portion[], names: WhereaboutsNames): string {
  if (portions.length === 0) return "Nowhere yet";
  const split = portions.length > 1;
  const lines = portions.map((p) => {
    if (p.whereaboutsType === "store") {
      const where = names.storeName(p.storeId!);
      return split ? `${p.count} at ${where}` : `In ${where}`;
    }
    if (p.whereaboutsType === "holder") {
      const who = names.personName(p.holderId!);
      return split ? `${p.count} with ${who}` : `With ${who}`;
    }
    const event = names.eventName(p.lastSeenEventId!);
    return split ? `${p.count} not confirmed — last seen at ${event}` : `Not confirmed — last seen at ${event}`;
  });
  return lines.join(" · ");
}
