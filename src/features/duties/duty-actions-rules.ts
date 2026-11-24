// What a User may do with one Duty. Pure, no database or Next.js.

export type DutyAction = "claim" | "leave" | "handOn" | "assign" | "setShare" | "confirm" | "setDestination";

export type DutyState = {
  direction: "to" | "from";
  userIds: string[];
  /** People who have already marked their own part done (a Duty shared by number can be done a part at a time). */
  doneUserIds?: string[];
  confirmed: boolean;
  voided: boolean;
};

/**
 * The actions open to the viewer, in the order the Duty sheet offers them. `claim`
 * joins the Duty whether it's empty or already has other People on it. Committee
 * assign (a multi-select, can take anyone off) rather than hand on.
 */
export function dutyActions(duty: DutyState, { viewerId, committee }: { viewerId: string; committee: boolean }): DutyAction[] {
  if (duty.confirmed || duty.voided) return [];
  const mine = duty.userIds.includes(viewerId);
  const done = duty.doneUserIds ?? [];
  const myPartOpen = mine && !done.includes(viewerId);
  const actions: DutyAction[] = [];
  if (!mine) actions.push("claim");
  if (duty.userIds.some((id) => !done.includes(id)) && (mine || committee)) actions.push("confirm");
  if (myPartOpen) actions.push("leave");
  if (myPartOpen && !committee) actions.push("handOn");
  if (myPartOpen) actions.push("setShare");
  if (committee) actions.push("assign");
  if (committee && duty.direction === "from") actions.push("setDestination");
  return actions;
}
