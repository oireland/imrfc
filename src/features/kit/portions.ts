// Whereabouts as portions: pure functions over plain data, no database or Next.js.
// A Kit Unit's Whereabouts is one or more Portions, each a count at exactly one Place.
// Portion counts always add up to the Kit Unit's Quantity.

export type Place =
  | { type: "store"; storeId: string }
  | { type: "holder"; holderId: string }
  | { type: "unconfirmed"; lastSeenEventId: string };

export type Portion = {
  id: string;
  kitUnitId: string;
  count: number;
  whereaboutsType: "store" | "holder" | "unconfirmed";
  storeId: string | null;
  holderId: string | null;
  lastSeenEventId: string | null;
};

/** A key identifying a Portion's Place, so Portions at the same Place can be found and merged. */
function placeKey(p: Pick<Portion, "whereaboutsType" | "storeId" | "holderId" | "lastSeenEventId">): string {
  if (p.whereaboutsType === "store") return `store:${p.storeId}`;
  if (p.whereaboutsType === "holder") return `holder:${p.holderId}`;
  return `unconfirmed:${p.lastSeenEventId}`;
}

function placeFields(place: Place): Pick<Portion, "whereaboutsType" | "storeId" | "holderId" | "lastSeenEventId"> {
  if (place.type === "store") return { whereaboutsType: "store", storeId: place.storeId, holderId: null, lastSeenEventId: null };
  if (place.type === "holder") return { whereaboutsType: "holder", storeId: null, holderId: place.holderId, lastSeenEventId: null };
  return { whereaboutsType: "unconfirmed", storeId: null, holderId: null, lastSeenEventId: place.lastSeenEventId };
}

export function totalQuantity(portions: Portion[]): number {
  return portions.reduce((sum, p) => sum + p.count, 0);
}

/** The single Place a Kit Unit is at, or undefined when it is split across several. */
export function singlePlace(portions: Portion[]): Place | undefined {
  if (portions.length !== 1) return undefined;
  return toPlace(portions[0]);
}

function toPlace(p: Portion): Place {
  if (p.whereaboutsType === "store") return { type: "store", storeId: p.storeId! };
  if (p.whereaboutsType === "holder") return { type: "holder", holderId: p.holderId! };
  return { type: "unconfirmed", lastSeenEventId: p.lastSeenEventId! };
}

/** Merges Portions at the same Place into one and drops any whose count has fallen to zero (or below). */
export function mergePortions(portions: Portion[]): Portion[] {
  const byPlace = new Map<string, Portion>();
  for (const p of portions) {
    const key = placeKey(p);
    const existing = byPlace.get(key);
    byPlace.set(key, existing ? { ...existing, count: existing.count + p.count } : p);
  }
  return [...byPlace.values()].filter((p) => p.count > 0);
}

function countAt(portions: Portion[], place: Place): number {
  const key = placeKey(placeFields(place));
  return portions.find((p) => placeKey(p) === key)?.count ?? 0;
}

/** Moves a count from one Place to another, merging at both ends. */
export function movePortion(
  portions: Portion[],
  { count, from, to }: { count: number; from: Place; to: Place },
): { ok: true; portions: Portion[] } | { ok: false; error: string } {
  const available = countAt(portions, from);
  if (count > available) return { ok: false, error: `There aren't ${count} there to move.` };

  const fromKey = placeKey(placeFields(from));
  const reduced = portions.map((p) => (placeKey(p) === fromKey ? { ...p, count: p.count - count } : p));
  const added: Portion = {
    id: crypto.randomUUID(),
    kitUnitId: portions[0]?.kitUnitId ?? "",
    count,
    ...placeFields(to),
  };
  return { ok: true, portions: mergePortions([...reduced, added]) };
}

/** Consolidates every Portion into one, at the target Place — moving the whole Quantity at once. */
export function wholeQuantityMove(portions: Portion[], to: Place): Portion[] {
  const total = totalQuantity(portions);
  return [{ id: crypto.randomUUID(), kitUnitId: portions[0]?.kitUnitId ?? "", count: total, ...placeFields(to) }];
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
): { ok: true; portions: Portion[] } | { ok: false; error: string } {
  let working = portions;
  for (const { from, count } of sources) {
    if (count <= 0) continue;
    const available = countAt(working, from);
    if (count > available) return { ok: false, error: `There aren't ${count} there to move.` };
    const key = placeKey(placeFields(from));
    working = working.map((p) => (placeKey(p) === key ? { ...p, count: p.count - count } : p));
  }
  const added = targets
    .filter(({ count }) => count > 0)
    .map(({ to, count }) => ({ id: crypto.randomUUID(), kitUnitId: portions[0]?.kitUnitId ?? "", count, ...placeFields(to) }));
  return { ok: true, portions: mergePortions([...working, ...added]) };
}

/** Raising a Kit Unit's Quantity: the extra count starts at Home. */
export function raiseQuantity(portions: Portion[], { storeId, addCount }: { storeId: string; addCount: number }): Portion[] {
  const added: Portion = {
    id: crypto.randomUUID(),
    kitUnitId: portions[0]?.kitUnitId ?? "",
    count: addCount,
    whereaboutsType: "store",
    storeId,
    holderId: null,
    lastSeenEventId: null,
  };
  return mergePortions([...portions, added]);
}

/** Lowering a Kit Unit's Quantity: Committee picks the Place when split, otherwise it's automatic. */
export function lowerQuantity(
  portions: Portion[],
  { removeCount, from }: { removeCount: number; from?: Place },
): { ok: true; portions: Portion[] } | { ok: false; error: string } {
  const total = totalQuantity(portions);
  if (total - removeCount < 1) return { ok: false, error: "Can't lower a kit unit's quantity below 1." };

  const place = from ?? singlePlace(portions);
  if (!place) return { ok: false, error: "Choose where to lower it from." };

  const available = countAt(portions, place);
  if (removeCount > available) return { ok: false, error: `There aren't ${removeCount} there to remove.` };

  const key = placeKey(placeFields(place));
  const reduced = portions.map((p) => (placeKey(p) === key ? { ...p, count: p.count - removeCount } : p));
  return { ok: true, portions: mergePortions(reduced) };
}
