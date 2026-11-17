import type { equipmentUnit, movementLogEntry } from "./schema";
import { placeOf, type Place, type Portion } from "./portions";

type EquipmentUnit = typeof equipmentUnit.$inferSelect;
type MovementLogEntry = typeof movementLogEntry.$inferSelect;

/** One Equipment Unit's Portion at a Place, as the Equipment view shows it: a row within a group. */
export type EquipmentRow = { unit: EquipmentUnit; portion: Portion };

export type WhereaboutsGroup =
  | { type: "store"; storeId: string; rows: EquipmentRow[] }
  | { type: "holder"; holderId: string; rows: EquipmentRow[] }
  | { type: "unconfirmed"; rows: EquipmentRow[] };

/**
 * Groups Active Equipment Units' Portions by Whereabouts: what the viewer holds, then each
 * Store, each other Holder, then Unconfirmed. A split Equipment Unit appears once per group,
 * with its count there.
 */
export function groupByWhereabouts(rows: EquipmentRow[], viewerId?: string): WhereaboutsGroup[] {
  const stores = Map.groupBy(
    rows.filter((r) => r.portion.whereaboutsType === "store" && r.portion.storeId),
    (r) => r.portion.storeId!,
  );
  const holders = Map.groupBy(
    rows.filter((r) => r.portion.whereaboutsType === "holder" && r.portion.holderId),
    (r) => r.portion.holderId!,
  );
  const unconfirmed = rows.filter((r) => r.portion.whereaboutsType === "unconfirmed");

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

/**
 * The one-tap Move offered on a Portion row: return an Equipment Unit I hold to its Home, otherwise "I've got it".
 * Moves the whole Portion unless asked for fewer (`count`, kept between 1 and what's there).
 */
export function quickMoveFor(row: EquipmentRow, userId: string, count?: number): QuickMove {
  const { unit, portion } = row;
  const from = placeOf(portion);
  const moved = count === undefined || Number.isNaN(count) ? portion.count : Math.min(Math.max(Math.trunc(count), 1), portion.count);
  if (portion.whereaboutsType === "holder" && portion.holderId === userId) {
    return { count: moved, from, to: { type: "store", storeId: unit.homeId } };
  }
  return { count: moved, from, to: { type: "holder", holderId: userId } };
}

export type WhereaboutsNames = {
  storeName: (storeId: string) => string;
  personName: (holderId: string) => string;
  eventName: (eventId: string) => string;
};

/**
 * An Equipment Unit's Whereabouts as a sentence for its detail page: "In the Shed" when it's
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

export type HistoryNames = {
  storeName: (storeId: string | null) => string;
  /** "you" for the viewer, "someone" when unknown; capitalised here when it starts a sentence. */
  personName: (userId: string | null) => string;
  eventName: (eventId: string | null) => string;
};

/**
 * One Movement Log entry as a sentence: "You put it in the Shed", "Tom gave it to Priya".
 * `split` is whether the Equipment Unit has more than one, so entries say "3" rather than "it".
 */
export function historyLine(entry: MovementLogEntry, names: HistoryNames, split: boolean): string {
  const { storeName, personName, eventName } = names;
  const who = personName(entry.userId).replace(/^./, (c) => c.toUpperCase());
  const word = split && entry.count ? String(entry.count) : "it";
  if (entry.kind === "condition_note") return `${who} noted: “${entry.conditionNote}”`;
  if (entry.kind === "added") return `${entry.userId ? who : "Someone"} added ${word} to ${storeName(entry.toStoreId)}`;
  if (entry.kind === "opening") {
    const where =
      entry.toType === "store"
        ? `in ${storeName(entry.toStoreId)}`
        : entry.toType === "holder"
          ? `with ${personName(entry.toHolderId)}`
          : `unconfirmed after ${eventName(entry.toLastSeenEventId)}`;
    return `Where ${word} was when this log began: ${where}`;
  }
  if (entry.kind === "bought") return `${who} bought ${entry.count}`;
  if (entry.kind === "lost") return `${who} lost ${entry.count}`;
  if (entry.kind === "unconfirmed") return `Nobody confirmed where ${word} went after ${eventName(entry.toLastSeenEventId)}`;
  const where = entry.toType === "store" ? `in ${storeName(entry.toStoreId)}` : `with ${personName(entry.toHolderId)}`;
  if (entry.reason === "duty") {
    if (entry.toType === "store") return `${who} put ${word} back ${where} (duty done)`;
    if (entry.toHolderId === entry.userId) return `${who} brought ${word} along (duty done)`;
    return `${who} confirmed ${word === "it" ? "it's" : `${word} is`} ${where} (duty done)`;
  }
  if (entry.toType === "store") return `${who} put ${word} ${where}`;
  if (entry.toHolderId === entry.userId) return `${who} took ${word}`;
  return `${who} gave ${word} to ${personName(entry.toHolderId)}`;
}
