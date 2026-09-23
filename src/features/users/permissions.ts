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
