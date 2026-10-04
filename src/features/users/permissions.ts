import type { AccessState, Role } from "./access";

export function canAccessApp(accessState: AccessState): boolean {
  return accessState === "approved";
}

export function isCommitteeOrAbove(role: Role): boolean {
  return role === "committee" || role === "admin";
}

export function canManageUsers(role: Role): boolean {
  return role === "admin";
}

/** Cancelling hides an Event's plans; deleting removes it for good, so only Admins may. */
export function canDeleteEvent(role: Role): boolean {
  return role === "admin";
}

/** Anyone may delete their own account; an Admin may delete anyone else's except another Admin's. */
export function canDeleteAccount(actor: { id: string; role: Role }, target: { id: string; role: Role }): boolean {
  if (actor.id === target.id) return true;
  return actor.role === "admin" && target.role !== "admin";
}
