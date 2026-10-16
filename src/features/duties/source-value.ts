import type { Place } from "@/features/equipment";

/** The string a confirm sheet uses to tell one source Place from another: unique per Place. */
export function sourceValue(place: Place): string {
  if (place.type === "store") return `store:${place.storeId}`;
  if (place.type === "holder") return `holder:${place.holderId}`;
  return `unconfirmed:${place.lastSeenEventId}`;
}

export function parseSourceValue(value: string): Place {
  if (value.startsWith("store:")) return { type: "store", storeId: value.slice("store:".length) };
  if (value.startsWith("unconfirmed:")) return { type: "unconfirmed", lastSeenEventId: value.slice("unconfirmed:".length) };
  return { type: "holder", holderId: value.slice("holder:".length) };
}
