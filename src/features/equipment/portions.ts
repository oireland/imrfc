import type { Result } from "@/lib/result";
// Whereabouts as portions: pure functions over plain data, no database or Next.js.
// An Equipment Unit's Whereabouts is one or more Portions, each a count at exactly one Place.
// Portion counts always add up to the Equipment Unit's Quantity.

export type Place =
  | { type: "store"; storeId: string }
  | { type: "holder"; holderId: string }
  | { type: "unconfirmed"; lastSeenEventId: string };

export type Portion = {
  id: string;
  equipmentUnitId: string;
  count: number;
  whereaboutsType: "store" | "holder" | "unconfirmed";
  storeId: string | null;
  holderId: string | null;
  lastSeenEventId: string | null;
};

/** The Place a Portion is at. */
export function placeOf(p: Portion): Place {
  if (p.whereaboutsType === "store") return { type: "store", storeId: p.storeId! };
  if (p.whereaboutsType === "holder") return { type: "holder", holderId: p.holderId! };
  return { type: "unconfirmed", lastSeenEventId: p.lastSeenEventId! };
}

/** A key identifying a Place ("store:<id>", "holder:<id>", "unconfirmed:<id>"), so Portions at the same Place can be found and merged. */
export function placeKey(place: Place): string {
  if (place.type === "store") return `store:${place.storeId}`;
  if (place.type === "holder") return `holder:${place.holderId}`;
  return `unconfirmed:${place.lastSeenEventId}`;
}

export function parsePlaceKey(value: string): Place {
  if (value.startsWith("store:")) return { type: "store", storeId: value.slice("store:".length) };
  if (value.startsWith("unconfirmed:")) return { type: "unconfirmed", lastSeenEventId: value.slice("unconfirmed:".length) };
  return { type: "holder", holderId: value.slice("holder:".length) };
}

export const samePlace = (a: Place, b: Place): boolean => placeKey(a) === placeKey(b);

export function placeFields(place: Place): Pick<Portion, "whereaboutsType" | "storeId" | "holderId" | "lastSeenEventId"> {
  if (place.type === "store") return { whereaboutsType: "store", storeId: place.storeId, holderId: null, lastSeenEventId: null };
  if (place.type === "holder") return { whereaboutsType: "holder", storeId: null, holderId: place.holderId, lastSeenEventId: null };
  return { whereaboutsType: "unconfirmed", storeId: null, holderId: null, lastSeenEventId: place.lastSeenEventId };
}

export function totalQuantity(portions: Portion[]): number {
  return portions.reduce((sum, p) => sum + p.count, 0);
}

/** The single Place an Equipment Unit is at, or undefined when it is split across several. */
export function singlePlace(portions: Portion[]): Place | undefined {
  if (portions.length !== 1) return undefined;
  return placeOf(portions[0]);
}

/** Merges Portions at the same Place into one and drops any whose count has fallen to zero (or below). */
export function mergePortions(portions: Portion[]): Portion[] {
  const byPlace = new Map<string, Portion>();
  for (const p of portions) {
    const key = placeKey(placeOf(p));
    const existing = byPlace.get(key);
    byPlace.set(key, existing ? { ...existing, count: existing.count + p.count } : p);
  }
  return [...byPlace.values()].filter((p) => p.count > 0);
}

export function countAt(portions: Portion[], place: Place): number {
  const key = placeKey(place);
  return portions.find((p) => placeKey(placeOf(p)) === key)?.count ?? 0;
}



/**
 * Moves counts from several source Places to several target Places in one go (Shared
 * Duties: gathering a count from more than one Place, and/or splitting it across more
 * than one final Holder). The pairing between a given source and target is arbitrary —
 * only the totals at each Place matter — so this just debits every source and credits
 * every target, then merges.
 */
export function moveMultiple(
  portions: Portion[],
  { sources, targets }: { sources: { from: Place; count: number }[]; targets: { to: Place; count: number }[] },
): Result<{ portions: Portion[] }> {
  const counts = [...sources.map((s) => s.count), ...targets.map((t) => t.count)];
  if (counts.some((c) => !Number.isInteger(c) || c < 0)) return { ok: false, error: "Enter how many to move." };
  const sourceTotal = sources.reduce((sum, s) => sum + s.count, 0);
  const targetTotal = targets.reduce((sum, t) => sum + t.count, 0);
  if (sourceTotal !== targetTotal) return { ok: false, error: "What's being moved doesn't add up." };

  let working = portions;
  for (const { from, count } of sources) {
    if (count <= 0) continue;
    const available = countAt(working, from);
    if (count > available) return { ok: false, error: `There aren't ${count} there to move.` };
    const key = placeKey(from);
    working = working.map((p) => (placeKey(placeOf(p)) === key ? { ...p, count: p.count - count } : p));
  }
  const added = targets
    .filter(({ count }) => count > 0)
    .map(({ to, count }) => ({ id: crypto.randomUUID(), equipmentUnitId: portions[0]?.equipmentUnitId ?? "", count, ...placeFields(to) }));
  return { ok: true, portions: mergePortions([...working, ...added]) };
}


/** Lowering an Equipment Unit's Quantity: Committee picks the Place when split, otherwise it's automatic. */
export function lowerQuantity(
  portions: Portion[],
  { removeCount, from }: { removeCount: number; from?: Place },
): Result<{ portions: Portion[] }> {
  const total = totalQuantity(portions);
  if (total - removeCount < 1) return { ok: false, error: "Can't lower an equipment unit's quantity below 1." };

  const place = from ?? singlePlace(portions);
  if (!place) return { ok: false, error: "Choose where to lower it from." };

  const available = countAt(portions, place);
  if (removeCount > available) return { ok: false, error: `There aren't ${removeCount} there to remove.` };

  const key = placeKey(place);
  const reduced = portions.map((p) => (placeKey(placeOf(p)) === key ? { ...p, count: p.count - removeCount } : p));
  return { ok: true, portions: mergePortions(reduced) };
}
