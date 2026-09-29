export type Role = "member" | "committee" | "admin";
export type AccessState = "pending" | "approved" | "blocked" | "deleted";

export function resolveNewUser(
  email: string,
  adminEmails: readonly string[],
): { role: Role; accessState: AccessState } {
  const isAdmin = adminEmails.includes(email);
  return {
    role: isAdmin ? "admin" : "member",
    accessState: isAdmin ? "approved" : "pending",
  };
}
