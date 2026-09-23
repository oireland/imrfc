import { eq, ne } from "drizzle-orm";
import type { Role } from "./access";
import { session, user } from "./schema";

export { resolveNewUser } from "./access";
export type { AccessState, Role } from "./access";
export { canAccessApp, canManageUsers, isCommitteeOrAbove } from "./permissions";
// Other features' schema.ts files reference this table for foreign keys.
export { user } from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type PendingUser = typeof user.$inferSelect;
export type AppUser = PendingUser;

export async function listPendingUsers(db: Db): Promise<PendingUser[]> {
  return db.select().from(user).where(eq(user.accessState, "pending"));
}

export async function listApprovedUsers(db: Db): Promise<PendingUser[]> {
  return db.select().from(user).where(ne(user.accessState, "pending"));
}

export async function approveUser(db: Db, userId: string) {
  await db.update(user).set({ accessState: "approved" }).where(eq(user.id, userId));
}

export async function blockUser(db: Db, userId: string) {
  await db.update(user).set({ accessState: "blocked" }).where(eq(user.id, userId));
  await db.delete(session).where(eq(session.userId, userId));
}

export async function unblockUser(db: Db, userId: string) {
  await db.update(user).set({ accessState: "approved" }).where(eq(user.id, userId));
}

export async function setRole(db: Db, userId: string, role: Role) {
  await db.update(user).set({ role }).where(eq(user.id, userId));
}
