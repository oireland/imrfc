export type ChecklistLevels = {
  event?: string[];
  series?: string[];
  default?: string[];
};

export type ResolvedChecklist = {
  source: "event" | "series" | "default" | "none";
  kitUnitIds: string[];
};

/** Event's own Checklist, else its Series', else its Event Type's Default. Undefined = no Checklist at that level. */
export function resolveChecklist(levels: ChecklistLevels): ResolvedChecklist {
  if (levels.event) return { source: "event", kitUnitIds: levels.event };
  if (levels.series) return { source: "series", kitUnitIds: levels.series };
  if (levels.default) return { source: "default", kitUnitIds: levels.default };
  return { source: "none", kitUnitIds: [] };
}
