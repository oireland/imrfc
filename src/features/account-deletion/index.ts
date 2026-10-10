import { eq } from "drizzle-orm";
import { deleteFeedToken } from "@/features/calendar-feed";
import { clearMobileNumber } from "@/features/contact";
import { releaseUpcomingDuties } from "@/features/duties";
import { unsubscribeEverywhere } from "@/features/push";
import { canDeleteAccount, eraseUser, user, type Role } from "@/features/users";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type DeleteAccountResult = { ok: true } | { ok: false; error: string };

/**
 * Deletes a User's account for good: their personal details, sign-ins, Feed Token,
 * Mobile number and Push subscriptions go, and they're taken off upcoming Duties. What they did stays in
 * the club's history under "Deleted user"; equipment they hold stays with that name
 * until someone moves it.
 */
export async function deleteAccount(
  db: Db,
  { actor, userId }: { actor: { id: string; role: Role }; userId: string },
): Promise<DeleteAccountResult> {
  const [target] = await db.select({ id: user.id, role: user.role, accessState: user.accessState }).from(user).where(eq(user.id, userId));
  if (!target || target.accessState === "deleted") return { ok: false, error: "That account has already been deleted." };
  if (!canDeleteAccount(actor, target)) {
    return {
      ok: false,
      error: target.role === "admin" ? "You can't delete another admin's account." : "Only an admin can delete someone else's account.",
    };
  }

  await releaseUpcomingDuties(db, userId);
  await deleteFeedToken(db, userId);
  await unsubscribeEverywhere(db, userId);
  await clearMobileNumber(db, userId);
  await eraseUser(db, userId);
  return { ok: true };
}
