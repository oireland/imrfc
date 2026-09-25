// What a User may do with one Duty. Pure, no database or Next.js.

export type DutyAction = "claim" | "confirm" | "handOn" | "assign" | "unassign" | "setDestination";

export type DutyState = {
  direction: "to" | "from";
  userId: string | null;
  confirmed: boolean;
  voided: boolean;
};

/** The actions open to the viewer, in the order the Duty sheet offers them. Committee assign rather than hand on. */
export function dutyActions(duty: DutyState, { viewerId, committee }: { viewerId: string; committee: boolean }): DutyAction[] {
  if (duty.confirmed || duty.voided) return [];
  const mine = duty.userId === viewerId;
  const actions: DutyAction[] = [];
  if (!duty.userId) actions.push("claim");
  if (duty.userId && (mine || committee)) actions.push("confirm");
  if (mine && !committee) actions.push("handOn");
  if (committee) actions.push("assign");
  if (committee && duty.userId) actions.push("unassign");
  if (committee && duty.direction === "from") actions.push("setDestination");
  return actions;
}
