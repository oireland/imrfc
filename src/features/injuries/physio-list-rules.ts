// Physio list: plain text for the physio. Pure, no database or Next.js.

export type PhysioNeed = {
  name: string;
  area: string;
  /** What they need ("strapping on the right ankle"); empty when they only ticked Needs physio. */
  physioNote: string;
};

/** The message to send the physio: `heading` says which day or Match, then one line per Injury, by name. */
export function formatPhysioList(heading: string, needs: PhysioNeed[]): string {
  const lines = [...needs]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((n) => `${n.name} — ${n.area.toLowerCase()}${n.physioNote ? `: ${n.physioNote}` : ""}`);
  return [`🩹 Physio list — ${heading}`, ...(lines.length > 0 ? lines : ["Nobody needs the physio."])].join("\n");
}
