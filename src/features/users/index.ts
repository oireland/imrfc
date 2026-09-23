import { eq } from "drizzle-orm";
import { user } from "./schema";

export { resolveNewUser } from "./access";
export type { AccessState, Role } from "./access";
export { canAccessApp, canManageUsers, isCommitteeOrAbove } from "./permissions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type PendingUser = typeof user.$inferSelect;

export async function listPendingUsers(db: Db): Promise<PendingUser[]> {
  return db.select().from(user).where(eq(user.accessState, "pending"));
}

export async function approveUser(db: Db, userId: string) {
  await db.update(user).set({ accessState: "approved" }).where(eq(user.id, userId));
}

export async function blockUser(db: Db, userId: string) {
  await db.update(user).set({ accessState: "blocked" }).where(eq(user.id, userId));
}

export async function unblockUser(db: Db, userId: string) {
  await db.update(user).set({ accessState: "approved" }).where(eq(user.id, userId));
}
