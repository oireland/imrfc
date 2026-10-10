import { eq, inArray } from "drizzle-orm";
import { isCommitteeOrAbove, type Role } from "@/features/users";
import { parseMobileNumber } from "./rules";
import { mobileNumber } from "./schema";

export { parseMobileNumber, whatsappLink } from "./rules";
export type { ParsedMobileNumber } from "./rules";
// Other features' schema.ts files may reference this table.
export { mobileNumber } from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Whoever is asking: only Committee (and Admins) and the User themselves may see a Mobile number. */
export type Viewer = { id: string; role: Role };

function canSee(viewer: Viewer, userId: string): boolean {
  return viewer.id === userId || isCommitteeOrAbove(viewer.role);
}

/** A User's Mobile number (E.164), or null if they have none or the viewer isn't allowed to see it. */
export async function getMobileNumber(db: Db, viewer: Viewer, userId: string): Promise<string | null> {
  if (!canSee(viewer, userId)) return null;
  const [row] = await db.select({ number: mobileNumber.number }).from(mobileNumber).where(eq(mobileNumber.userId, userId));
  return row?.number ?? null;
}

/** Mobile numbers for a batch of Users, by user id. Users with no number, or whose number the viewer can't see, are left out. */
export async function listMobileNumbers(db: Db, viewer: Viewer, userIds: string[]): Promise<Map<string, string>> {
  const visible = userIds.filter((id) => canSee(viewer, id));
  if (visible.length === 0) return new Map();
  const rows: { userId: string; number: string }[] = await db
    .select({ userId: mobileNumber.userId, number: mobileNumber.number })
    .from(mobileNumber)
    .where(inArray(mobileNumber.userId, visible));
  const byUser = new Map(rows.map((r) => [r.userId, r.number]));
  return new Map(visible.flatMap((id) => (byUser.has(id) ? [[id, byUser.get(id)!] as const] : [])));
}

/** Whether a User has a Mobile number saved; says nothing about what it is, so Onboarding can ask it. */
export async function hasMobileNumber(db: Db, userId: string): Promise<boolean> {
  const [row] = await db.select({ userId: mobileNumber.userId }).from(mobileNumber).where(eq(mobileNumber.userId, userId));
  return Boolean(row);
}

/**
 * Sets a User's Mobile number from what was typed (`07…` or `+…`); empty clears it.
 * A User may set their own; Committee may set anyone's.
 */
export async function setMobileNumber(
  db: Db,
  actor: Viewer,
  userId: string,
  input: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!canSee(actor, userId)) return { ok: false, error: "Only Committee can change someone else's number." };
  const parsed = parseMobileNumber(input);
  if (!parsed.ok) return parsed;
  if (parsed.number === null) {
    await clearMobileNumber(db, userId);
    return { ok: true };
  }
  await db
    .insert(mobileNumber)
    .values({ userId, number: parsed.number })
    .onConflictDoUpdate({ target: mobileNumber.userId, set: { number: parsed.number, updatedAt: new Date() } });
  return { ok: true };
}

/** Removes a User's Mobile number. Not permission-checked: used by account deletion. */
export async function clearMobileNumber(db: Db, userId: string) {
  await db.delete(mobileNumber).where(eq(mobileNumber.userId, userId));
}
