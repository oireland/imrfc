// Source selection for Confirming a Duty when an Equipment Unit's Whereabouts is split across
// several Places, and the "who has how many" split for several People on a Duty. Pure,
// no database.
import type { Place, Portion } from "@/features/equipment";

export type SourcePart = { place: Place; count: number };
export type HolderPart = { userId: string; count: number };
type Gathered = { sources: SourcePart[]; ok: boolean };

function toPlace(p: Portion): Place {
  if (p.whereaboutsType === "store") return { type: "store", storeId: p.storeId! };
  if (p.whereaboutsType === "holder") return { type: "holder", holderId: p.holderId! };
  return { type: "unconfirmed", lastSeenEventId: p.lastSeenEventId! };
}

function gather(ordered: Portion[], count: number): Gathered {
  const sources: SourcePart[] = [];
  let need = count;
  for (const p of ordered) {
    if (need <= 0) break;
    const take = Math.min(need, p.count);
    if (take <= 0) continue;
    sources.push({ place: toPlace(p), count: take });
    need -= take;
  }
  return { sources, ok: need <= 0 };
}

/**
 * Gathers a count for Confirming a To Duty, across several Places if one isn't enough:
 * the Duty's own People's Portions first, then Home, then another Store, then another
 * Holder, then (to still resolve a long-Unconfirmed unit) Unconfirmed.
 */
export function gatherConfirmSources(
  portions: Portion[],
  { dutyUserIds, homeStoreId, count }: { dutyUserIds: string[]; homeStoreId: string; count: number },
): Gathered {
  const available = portions.filter((p) => p.count > 0);
  const own = (uid: string) => available.filter((p) => p.whereaboutsType === "holder" && p.holderId === uid);
  const ordered = [
    ...dutyUserIds.flatMap(own),
    ...available.filter((p) => p.whereaboutsType === "store" && p.storeId === homeStoreId),
    ...available.filter((p) => p.whereaboutsType === "store" && p.storeId !== homeStoreId),
    ...available.filter((p) => p.whereaboutsType === "holder" && !dutyUserIds.includes(p.holderId!)),
    ...available.filter((p) => p.whereaboutsType === "unconfirmed"),
  ];
  return gather(ordered, count);
}

/**
 * Whether Confirming a To Duty needs to ask where the count comes from: only when what
 * isn't already with the Duty's own People can't be filled from a single other Place.
 */
export function needsSourceChoice(portions: Portion[], { dutyUserIds, count }: { dutyUserIds: string[]; count: number }): boolean {
  const available = portions.filter((p) => p.count > 0);
  const own = available
    .filter((p) => p.whereaboutsType === "holder" && p.holderId && dutyUserIds.includes(p.holderId))
    .reduce((sum, p) => sum + p.count, 0);
  const remaining = count - own;
  if (remaining <= 0) return false;
  const others = available.filter((p) => !(p.whereaboutsType === "holder" && p.holderId && dutyUserIds.includes(p.holderId)));
  return !others.some((p) => p.count >= remaining);
}

/**
 * Gathers a count for Confirming a From Duty: mainly from the Duty's own People's
 * Portions (what they're holding to bring back), in the given order. If that isn't
 * quite enough, it falls back to any Store the rest is sitting at (never someone
 * else's Portion — a different named Holder is a real Move, not loose bookkeeping),
 * so a whole-Quantity Confirm still consolidates everything into the Destination.
 */
export function gatherFromDutyUsers(portions: Portion[], { userIds, count }: { userIds: string[]; count: number }): Gathered {
  const available = portions.filter((p) => p.count > 0);
  const own = userIds.flatMap((uid) => available.filter((p) => p.whereaboutsType === "holder" && p.holderId === uid));
  const fallback = available.filter((p) => p.whereaboutsType !== "holder");
  return gather([...own, ...fallback], count);
}

/** What the given People are holding right now, up to `count`, in the given order — nothing from any Store or anyone else. */
export function gatherHeldBy(portions: Portion[], { userIds, count }: { userIds: string[]; count: number }): Gathered {
  const available = portions.filter((p) => p.count > 0);
  return gather(userIds.flatMap((uid) => available.filter((p) => p.whereaboutsType === "holder" && p.holderId === uid)), count);
}

/**
 * When a From Duty was handed on while the unit is still with the person it came from, the
 * new People hold none of it and a plain Confirm is refused. This is each way out: "Tom has it
 * from Sam", i.e. what the Duty's People hold plus the rest from another Holder who has enough.
 * Empty when a plain Confirm already works.
 */
export function handedOnSources(portions: Portion[], { userIds, count }: { userIds: string[]; count: number }): { holderId: string; sources: SourcePart[] }[] {
  if (gatherFromDutyUsers(portions, { userIds, count }).ok) return [];
  const own = gatherHeldBy(portions, { userIds, count }).sources;
  const remaining = count - own.reduce((sum, part) => sum + part.count, 0);
  return portions
    .filter((p) => p.whereaboutsType === "holder" && p.holderId && !userIds.includes(p.holderId) && p.count >= remaining)
    .map((p) => ({
      holderId: p.holderId!,
      sources: [...own, { place: { type: "holder", holderId: p.holderId! } as Place, count: remaining }],
    }));
}

/**
 * Validates a "who has how many" split: every part names one of the Duty's People, no
 * negative counts, and the parts add up to the Duty's count.
 */
export function validateHolderSplit(
  count: number,
  parts: HolderPart[],
  userIds: string[],
): { ok: true } | { ok: false; error: string } {
  if (parts.some((p) => !userIds.includes(p.userId))) return { ok: false, error: "Only the duty's people can hold it." };
  if (parts.some((p) => !Number.isInteger(p.count) || p.count < 0)) return { ok: false, error: "Counts can't be negative." };
  const sum = parts.reduce((s, p) => s + p.count, 0);
  if (sum !== count) return { ok: false, error: `Counts must add up to ${count}.` };
  return { ok: true };
}
