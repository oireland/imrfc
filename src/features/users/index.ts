import type { Db } from "@/db/types";
import { LIMITS, firstTooLong } from "@/lib/text-limits";
import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import type { Role } from "./access";
import type { RugbyPosition } from "./positions";
import { displayName } from "./display-name";
import { account, session, user } from "./schema";

export { resolveNewUser } from "./access";
export type { AccessState, Role } from "./access";
export { displayName } from "./display-name";
export { canDeleteAccount, canDeleteEvent, canManageUsers, isCommitteeOrAbove } from "./permissions";
export { RUGBY_POSITIONS } from "./positions";
export type { RugbyPosition } from "./positions";
// Other features' schema.ts files reference `user` for foreign keys; the auth library maps the rest.
export { account, session, user, verification } from "./schema";


export type User = typeof user.$inferSelect;

export async function listPendingUsers(db: Db): Promise<User[]> {
  return db.select().from(user).where(eq(user.accessState, "pending"));
}

export async function countPendingUsers(db: Db): Promise<number> {
  const [row] = await db.select({ n: count() }).from(user).where(eq(user.accessState, "pending"));
  return row.n;
}

/** Users who can sign in and be picked, asked or alerted: Approved only. */
export async function listApprovedUsers(db: Db): Promise<User[]> {
  return db.select().from(user).where(eq(user.accessState, "approved"));
}

/**
 * Everyone who has ever been approved, including Blocked and Deleted Users. For looking up
 * names in past records (Moves, replies, Duties) and for the Users admin; never for choosing
 * who to pick, ask or alert.
 */
export async function listKnownUsers(db: Db): Promise<User[]> {
  return db.select().from(user).where(ne(user.accessState, "pending"));
}

/** A name lookup over these Users that never fails: "Someone" for an unknown id. */
export function nameLookup(people: { id: string; name: string; email: string }[]): (id: string | null | undefined) => string {
  const names = new Map(people.map((p) => [p.id, displayName(p)]));
  return (id) => (id ? names.get(id) : undefined) ?? "Someone";
}

/** Everyone ever approved, as a name lookup that never fails ("Someone" for an unknown id). */
export async function loadNames(db: Db): Promise<(id: string | null | undefined) => string> {
  return nameLookup(await listKnownUsers(db));
}

/** Approved Committee and Admins, sorted by id, for a push; `except` leaves out whoever caused it. */
export async function listCommitteeIds(db: Db, { except }: { except?: string } = {}): Promise<string[]> {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.accessState, "approved"), inArray(user.role, ["committee", "admin"]), except ? ne(user.id, except) : undefined))
    .orderBy(sql`${user.id} collate "C"`) // byte order, as the callers' old JS .sort() was;
  return rows.map((r) => r.id);
}

/** Which of these ids belong to Approved Users (unknown, pending, blocked and deleted ones are left out). */
export async function filterApprovedUserIds(db: Db, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(and(inArray(user.id, ids), eq(user.accessState, "approved")));
  return new Set(rows.map((r) => r.id));
}

async function setApproved(db: Db, userId: string) {
  await db.update(user).set({ accessState: "approved" }).where(eq(user.id, userId));
}

export async function approveUser(db: Db, userId: string) {
  await setApproved(db, userId);
}

async function blockUser(db: Db, userId: string) {
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
  await setApproved(db, userId);
}

async function setRole(db: Db, userId: string, role: Role) {
  await db.update(user).set({ role }).where(eq(user.id, userId));
}

const ROLES: readonly Role[] = ["member", "committee", "admin"];

function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export type UserChangeResult = { ok: true } | { ok: false; error: string; code: string };

/**
 * An Admin changes a User's Role. The Role must be a real one, and the last Admin can't demote
 * themselves, or nobody could manage Users (ADMIN_EMAILS only applies at first sign-in).
 */
export async function changeRole(
  db: Db,
  { actorId, userId, role }: { actorId: string; userId: string; role: unknown },
): Promise<UserChangeResult> {
  if (!isRole(role)) return { ok: false, code: "invalid-role", error: "That isn't a Role." };
  if (actorId === userId && role !== "admin") {
    const [{ n }] = await db
      .select({ n: count() })
      .from(user)
      .where(and(eq(user.role, "admin"), eq(user.accessState, "approved"), ne(user.id, userId)));
    if (n === 0) return { ok: false, code: "last-admin", error: "You're the only Admin, so you can't give up the role." };
  }
  await setRole(db, userId, role);
  return { ok: true };
}

/** An Admin blocks a User, ending their sessions. Nobody can block themselves. */
export async function blockUserAs(db: Db, { actorId, userId }: { actorId: string; userId: string }): Promise<UserChangeResult> {
  if (actorId === userId) return { ok: false, code: "block-self", error: "You can't block yourself." };
  await blockUser(db, userId);
  return { ok: true };
}

export async function setName(db: Db, userId: string, name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Please enter your name." };
  const tooLong = firstTooLong([["name", trimmed, LIMITS.name]]);
  if (tooLong) return { ok: false, error: tooLong };
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
