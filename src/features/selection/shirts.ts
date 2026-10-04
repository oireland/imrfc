import { RUGBY_POSITIONS, type RugbyPosition } from "@/features/users";

/** The Position each starting Shirt plays; Shirts 16 and up (the bench and extras) have none. */
const STARTING_POSITIONS: RugbyPosition[] = [
  "Loosehead Prop",
  "Hooker",
  "Tighthead Prop",
  "Lock",
  "Lock",
  "Blindside Flanker",
  "Openside Flanker",
  "Number 8",
  "Scrum-half",
  "Fly-half",
  "Wing",
  "Inside Centre",
  "Outside Centre",
  "Wing",
  "Fullback",
];

export const STARTING_SHIRTS = STARTING_POSITIONS.length;
export const DEFAULT_SHIRTS = 23;

export const positionOfShirt = (shirt: number): RugbyPosition | null => STARTING_POSITIONS[shirt - 1] ?? null;

// Positions that can cover for each other when a Shirt's own Position can't be filled.
const PAIRED: Partial<Record<RugbyPosition, RugbyPosition>> = {
  "Blindside Flanker": "Openside Flanker",
  "Openside Flanker": "Blindside Flanker",
  "Inside Centre": "Outside Centre",
  "Outside Centre": "Inside Centre",
};

export type Candidate = {
  id: string;
  name: string;
  preferredPosition: RugbyPosition | null;
  otherPositions: RugbyPosition[];
};

/** How well a Player suits a Shirt. `rest` on a starting Shirt is Out of position; the bench has no Position to miss. */
export type Fit = "preferred" | "other" | "cover" | "rest" | "bench";

export function fitFor(shirt: number, player: Candidate): Fit {
  const wanted = positionOfShirt(shirt);
  if (!wanted) return "bench";
  if (player.preferredPosition === wanted) return "preferred";
  if (player.otherPositions.includes(wanted)) return "other";
  const paired = PAIRED[wanted];
  if (paired && (player.preferredPosition === paired || player.otherPositions.includes(paired))) return "cover";
  return "rest";
}

const FIT_ORDER: Fit[] = ["preferred", "other", "cover", "rest", "bench"];
const positionOrder = (p: RugbyPosition | null) => (p ? RUGBY_POSITIONS.indexOf(p) : RUGBY_POSITIONS.length);

/** Everyone, best fit for the Shirt first. The bench is simply in Position order. */
export function sortForShirt(shirt: number, candidates: Candidate[]): { candidate: Candidate; fit: Fit }[] {
  return candidates
    .map((candidate) => ({ candidate, fit: fitFor(shirt, candidate) }))
    .sort((a, b) =>
      FIT_ORDER.indexOf(a.fit) - FIT_ORDER.indexOf(b.fit) ||
      (a.fit === "bench" ? positionOrder(a.candidate.preferredPosition) - positionOrder(b.candidate.preferredPosition) : 0) ||
      a.candidate.name.localeCompare(b.candidate.name),
    );
}
