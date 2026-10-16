import type { Db } from "@/db/types";
import { eq } from "drizzle-orm";
import { deleteFeedToken } from "@/features/calendar-feed";
import { clearMobileNumber } from "@/features/contact";
import { releaseUpcomingDuties } from "@/features/duties";
import { clearInjuries } from "@/features/injuries";
import { clearAway } from "@/features/players";
import { unsubscribeEverywhere } from "@/features/push";
import { canDeleteAccount, eraseUser, user, type Role } from "@/features/users";


export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; error: string; code: "already-deleted" | "delete-admin" | "admin-only" };

/**
 * Deletes a User's account for good: their personal details, sign-ins, Feed Token,
 * Mobile number, time Away, Injuries and Push subscriptions go, and they're taken off upcoming Duties. What they did stays in
 * the club's history under "Deleted user"; equipment they hold stays with that name
 * until someone moves it.
 */
export async function deleteAccount(
  db: Db,
  { actor, userId }: { actor: { id: string; role: Role }; userId: string },
): Promise<DeleteAccountResult> {
  const [target] = await db.select({ id: user.id, role: user.role, accessState: user.accessState }).from(user).where(eq(user.id, userId));
  if (!target || target.accessState === "deleted") {
    return { ok: false, code: "already-deleted", error: "That account has already been deleted." };
  }
  if (!canDeleteAccount(actor, target)) {
    return {
      ok: false,
      code: target.role === "admin" ? "delete-admin" : "admin-only",
      error: target.role === "admin" ? "You can't delete another admin's account." : "Only an admin can delete someone else's account.",
    };
  }

  // All or nothing: a failure partway must not leave someone half-erased.
  await db.transaction(async (tx: Db) => {
    await releaseUpcomingDuties(tx, userId);
    await deleteFeedToken(tx, userId);
    await unsubscribeEverywhere(tx, userId);
    await clearMobileNumber(tx, userId);
    await clearAway(tx, userId);
    await clearInjuries(tx, userId);
    await eraseUser(tx, userId);
  });
  return { ok: true };
}
