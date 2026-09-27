/** The fixed list of rugby positions a Player can set as their Preferred Position (SPEC → Players). */
export const RUGBY_POSITIONS = [
  "Loosehead Prop",
  "Hooker",
  "Tighthead Prop",
  "Lock",
  "Blindside Flanker",
  "Openside Flanker",
  "Number 8",
  "Scrum-half",
  "Fly-half",
  "Inside Centre",
  "Outside Centre",
  "Wing",
  "Fullback",
] as const;

export type RugbyPosition = (typeof RUGBY_POSITIONS)[number];
