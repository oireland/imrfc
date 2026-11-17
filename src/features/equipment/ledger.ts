// The Movement Log as a ledger: pure functions over plain data, no database or Next.js.
// Every change to an Equipment Unit's Whereabouts is an entry; its Portions are what you get by
// applying every entry in order, starting from nothing. The `equipment_portion` table is that
// result kept up to date in the same transaction, so reads stay fast.

import { countAt, mergePortions, placeFields, placeKey, type Place, type Portion } from "./portions";

export type LedgerEntry =
  /** A new Equipment Unit's starting stock. */
  | { kind: "added"; count: number; to: Place }
  /** Quantity raised: more of it were bought. */
  | { kind: "bought"; count: number; to: Place }
  /** Quantity lowered: some were lost. */
  | { kind: "lost"; count: number; from: Place }
  | { kind: "move"; count: number; from: Place; to: Place }
  /** Nobody confirmed where it went after an Event: `to` is Unconfirmed, last seen there. */
  | { kind: "unconfirmed"; count: number; from: Place; to: Place }
  /** Doesn't change the Whereabouts. */
  | { kind: "condition_note" };

type Applied = { ok: true; portions: Portion[] } | { ok: false; error: string };

function credit(portions: Portion[], equipmentUnitId: string, place: Place, count: number): Portion[] {
  return mergePortions([...portions, { id: crypto.randomUUID(), equipmentUnitId, count, ...placeFields(place) }]);
}

function debit(portions: Portion[], place: Place, count: number): Applied {
  const available = countAt(portions, place);
  if (count > available) return { ok: false, error: `There aren't ${count} there to move.` };
  const key = placeKey(placeFields(place));
  return { ok: true, portions: mergePortions(portions.map((p) => (placeKey(p) === key ? { ...p, count: p.count - count } : p))) };
}

/** Applies one entry to an Equipment Unit's current Portions. */
export function applyEntry(portions: Portion[], entry: LedgerEntry, equipmentUnitId = portions[0]?.equipmentUnitId ?? ""): Applied {
  if (entry.kind === "condition_note") return { ok: true, portions };
  if (!Number.isInteger(entry.count) || entry.count < 1) return { ok: false, error: "Enter how many to move." };
  switch (entry.kind) {
    case "added":
    case "bought":
      return { ok: true, portions: credit(portions, equipmentUnitId, entry.to, entry.count) };
    case "lost":
      return debit(portions, entry.from, entry.count);
    case "move":
    case "unconfirmed": {
      const taken = debit(portions, entry.from, entry.count);
      if (!taken.ok) return taken;
      return { ok: true, portions: credit(taken.portions, equipmentUnitId, entry.to, entry.count) };
    }
  }
}

/** An Equipment Unit's Portions rebuilt from its whole ledger, oldest entry first. */
export function replay(equipmentUnitId: string, entries: LedgerEntry[]): Applied {
  let portions: Portion[] = [];
  for (const [i, entry] of entries.entries()) {
    const applied = applyEntry(portions, entry, equipmentUnitId);
    if (!applied.ok) return { ok: false, error: `entry ${i + 1}: ${applied.error}` };
    portions = applied.portions;
  }
  return { ok: true, portions };
}

/** Whether two sets of Portions put the same counts at the same Places (ids and order don't matter). */
export function sameWhereabouts(a: Portion[], b: Portion[]): boolean {
  const counts = (portions: Portion[]) => new Map(mergePortions(portions).map((p) => [placeKey(p), p.count]));
  const left = counts(a);
  const right = counts(b);
  return left.size === right.size && [...left].every(([key, count]) => right.get(key) === count);
}
