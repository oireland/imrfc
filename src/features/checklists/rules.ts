/** A Checklist line: a Kit Unit and how many it asks for. null count means "all of them",
 * so it follows the Kit Unit's Quantity as it changes. */
export type ChecklistLine = { kitUnitId: string; count: number | null };

export type ChecklistLevels = {
  event?: ChecklistLine[];
  series?: ChecklistLine[];
  default?: ChecklistLine[];
};

export type ResolvedChecklist = {
  source: "event" | "series" | "default" | "none";
  items: ChecklistLine[];
};

/** Event's own Checklist, else its Series', else its Event Type's Default. Undefined = no Checklist at that level. */
export function resolveChecklist(levels: ChecklistLevels): ResolvedChecklist {
  if (levels.event) return { source: "event", items: levels.event };
  if (levels.series) return { source: "series", items: levels.series };
  if (levels.default) return { source: "default", items: levels.default };
  return { source: "none", items: [] };
}

/** How many of a Kit Unit a Checklist line actually asks for: "all" follows the current
 * Quantity, and an explicit number is capped at it. */
export function effectiveCount(count: number | null, quantity: number): number {
  if (count === null) return quantity;
  return Math.min(count, quantity);
}
