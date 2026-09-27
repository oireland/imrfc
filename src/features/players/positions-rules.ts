import type { RugbyPosition } from "@/features/users";

/** A Player's Preferred Position plus any number of Other Positions, deduplicated and never repeating the Preferred one. */
export function normalizePositions(preferred: RugbyPosition, other: RugbyPosition[]): { preferred: RugbyPosition; other: RugbyPosition[] } {
  return { preferred, other: [...new Set(other)].filter((p) => p !== preferred) };
}
