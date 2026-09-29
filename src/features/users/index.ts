import { count, eq, ne } from "drizzle-orm";
import type { Role } from "./access";
import type { RugbyPosition } from "./positions";
import { account, session, user } from "./schema";

export { resolveNewUser } from "./access";
export type { AccessState, Role } from "./access";
export { displayName } from "./display-name";
export { canAccessApp, canDeleteAccount, canManageUsers, isCommitteeOrAbove } from "./permissions";
export { RUGBY_POSITIONS } from "./positions";
export type { RugbyPosition } from "./positions";
// Other features' schema.ts files reference this table for foreign keys.
export { user } from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type PendingUser = typeof user.$inferSelect;
export type AppUser = PendingUser;

export async function listPendingUsers(db: Db): Promise<PendingUser[]> {
  return db.select().from(user).where(eq(user.accessState, "pending"));
}

export async function countPendingUsers(db: Db): Promise<number> {
  const [row] = await db.select({ n: count() }).from(user).where(eq(user.accessState, "pending"));
  return row.n;
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

/**
 * Wipes a User's personal details and sign-in methods. The row stays, as "Deleted user",
 * so Moves, past Duties and replies that mention them still read; the email is freed,
 * so signing in with it again starts a brand-new Pending account.
 */
export async function eraseUser(db: Db, userId: string) {
  await db.delete(session).where(eq(session.userId, userId));
  await db.delete(account).where(eq(account.userId, userId));
  await db
    .update(user)
    .set({
      name: "Deleted user",
      email: `deleted-${userId}@deleted.invalid`,
      emailVerified: false,
      image: null,
      accessState: "deleted",
      preferredPosition: null,
      otherPositions: [],
      playing: false,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId));
}

export async function unblockUser(db: Db, userId: string) {
  await db.update(user).set({ accessState: "approved" }).where(eq(user.id, userId));
}

export async function setRole(db: Db, userId: string, role: Role) {
  await db.update(user).set({ role }).where(eq(user.id, userId));
}

export async function setName(db: Db, userId: string, name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Please enter your name." };
  await db.update(user).set({ name: trimmed }).where(eq(user.id, userId));
  return { ok: true };
}

export async function setPreferredPosition(db: Db, userId: string, position: RugbyPosition) {
  await db.update(user).set({ preferredPosition: position }).where(eq(user.id, userId));
}

export async function setPositions(db: Db, userId: string, positions: { preferred: RugbyPosition; other: RugbyPosition[] }) {
  await db
    .update(user)
    .set({ preferredPosition: positions.preferred, otherPositions: positions.other })
    .where(eq(user.id, userId));
}

export async function setPlaying(db: Db, userId: string, playing: boolean) {
  await db.update(user).set({ playing }).where(eq(user.id, userId));
}

export type ThemePreference = "system" | "light" | "dark";

export async function setThemePreference(db: Db, userId: string, theme: ThemePreference) {
  await db.update(user).set({ theme }).where(eq(user.id, userId));
}
