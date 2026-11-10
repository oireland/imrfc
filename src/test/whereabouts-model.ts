// A deliberately simple model of an Equipment Unit's Whereabouts for property-based tests: a map from
// Place to count. The real code (Portions, merging, the database) is checked against it.
import fc from "fast-check";
import type { Place, Portion } from "@/features/equipment";

export type Model = Map<string, number>;

export const HOME = "shed";
export const OTHER_STORE = "clubhouse";
export const HOLDERS = ["sam", "tom", "priya"] as const;
export const EVENTS = ["saturday-match", "tuesday-training"] as const;

export const PLACES: Place[] = [
  { type: "store", storeId: HOME },
  { type: "store", storeId: OTHER_STORE },
  ...HOLDERS.map((holderId) => ({ type: "holder" as const, holderId })),
  ...EVENTS.map((lastSeenEventId) => ({ type: "unconfirmed" as const, lastSeenEventId })),
];

export const placeArb = fc.constantFrom(...PLACES);
export const moveTargetArb = fc.constantFrom(...PLACES.filter((p) => p.type !== "unconfirmed")) as fc.Arbitrary<
  Exclude<Place, { type: "unconfirmed" }>
>;

/**
 * Where to take equipment from. Mostly "the n-th Place that has some" (resolved against the model when
 * the step runs, so most Moves are possible); sometimes any Place at all, so impossible ones get tried too.
 */
export type SourceChoice = { held: number } | { place: Place };
export const sourceArb: fc.Arbitrary<SourceChoice> = fc.oneof(
  { weight: 4, arbitrary: fc.nat(10).map((held) => ({ held })) },
  { weight: 1, arbitrary: placeArb.map((place) => ({ place })) },
);

export function resolveSource(model: Model, choice: SourceChoice): Place {
  if ("place" in choice) return choice.place;
  const held = [...model.keys()].sort();
  return held.length === 0 ? PLACES[0] : placeOf(held[choice.held % held.length]);
}

/** A split Move's sources and how to cut it: mostly balanced, sometimes the targets ask for one more or one less. */
export const splitArb = fc.record({
  sources: fc.array(fc.record({ from: sourceArb, count: fc.integer({ min: 0, max: 4 }) }), { minLength: 1, maxLength: 3 }),
  cuts: fc.array(fc.integer({ min: 0, max: 12 }), { minLength: 2, maxLength: 2 }),
  skew: fc.constantFrom(0, 0, 0, 0, 1, -1),
});

export function key(place: Place): string {
  if (place.type === "store") return `store:${place.storeId}`;
  if (place.type === "holder") return `holder:${place.holderId}`;
  return `unconfirmed:${place.lastSeenEventId}`;
}

export function placeOf(k: string): Place {
  return PLACES.find((p) => key(p) === k)!;
}

export function portionKey(p: Pick<Portion, "whereaboutsType" | "storeId" | "holderId" | "lastSeenEventId">): string {
  if (p.whereaboutsType === "store") return `store:${p.storeId}`;
  if (p.whereaboutsType === "holder") return `holder:${p.holderId}`;
  return `unconfirmed:${p.lastSeenEventId}`;
}

export function countAt(model: Model, place: Place): number {
  return model.get(key(place)) ?? 0;
}

export function modelTotal(model: Model): number {
  return [...model.values()].reduce((sum, n) => sum + n, 0);
}

export function allAt(place: Place, count: number): Model {
  return new Map([[key(place), count]]);
}

/** Moves `count` from one Place to another; Places left empty disappear, as merged Portions do. */
export function shift(model: Model, from: Place, to: Place, count: number): Model {
  return add(add(model, from, -count), to, count);
}

export function add(model: Model, place: Place, count: number): Model {
  const next = new Map(model);
  const n = (next.get(key(place)) ?? 0) + count;
  if (n === 0) next.delete(key(place));
  else next.set(key(place), n);
  return next;
}

/** Whether sources (repeats allowed) can all be taken from what the model has at each Place. */
export function canTake(model: Model, sources: { from: Place; count: number }[]): boolean {
  const asked = new Map<string, number>();
  for (const s of sources) asked.set(key(s.from), (asked.get(key(s.from)) ?? 0) + s.count);
  return [...asked].every(([k, n]) => n <= (model.get(k) ?? 0));
}

/** Debits every source and credits every target. */
export function moveMany(model: Model, sources: { from: Place; count: number }[], targets: { to: Place; count: number }[]): Model {
  let next = model;
  for (const s of sources) next = add(next, s.from, -s.count);
  for (const t of targets) next = add(next, t.to, t.count);
  return next;
}

/** Splits `total` across the targets: each but the last takes up to its cut, the last takes the rest. */
export function splitAcross<T>(total: number, targets: T[], cuts: number[]): { to: T; count: number }[] {
  let left = total;
  return targets.map((to, i) => {
    const take = i === targets.length - 1 ? left : Math.min(left, cuts[i] ?? 0);
    left -= take;
    return { to, count: take };
  });
}

/** Portions (or model entries) as sorted [Place, count] pairs, so the two can be compared. */
export function portionPairs(portions: Pick<Portion, "whereaboutsType" | "storeId" | "holderId" | "lastSeenEventId" | "count">[]) {
  return portions.map((p) => [portionKey(p), p.count] as [string, number]).sort(([a], [b]) => a.localeCompare(b));
}

export function modelPairs(model: Model): [string, number][] {
  return [...model.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** What every Whereabouts must satisfy whatever happened: positive whole counts, one Portion per Place. Empty when fine. */
export function problemsWith(portions: Pick<Portion, "whereaboutsType" | "storeId" | "holderId" | "lastSeenEventId" | "count">[]) {
  const problems: string[] = [];
  if (!portions.every((p) => Number.isInteger(p.count) && p.count > 0)) problems.push("a count isn't a positive whole number");
  if (new Set(portions.map(portionKey)).size !== portions.length) problems.push("two Portions share a Place");
  return problems;
}
