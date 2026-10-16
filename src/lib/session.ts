import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { canManageUsers, isCommitteeOrAbove } from "@/features/users";
import type { AccessState, RugbyPosition, Role, ThemePreference } from "@/features/users";
import { auth } from "./auth";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  accessState: AccessState;
  theme: ThemePreference;
  preferredPosition: RugbyPosition | null;
  otherPositions: RugbyPosition[];
  playing: boolean;
};

/** Cached per request: layouts, the page and its actions share one session lookup. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, email, role, accessState, theme, preferredPosition, otherPositions, playing } =
    session.user as typeof session.user & CurrentUser;
  return {
    id,
    name,
    email,
    role,
    accessState,
    theme: theme ?? "system",
    preferredPosition: preferredPosition ?? null,
    otherPositions: otherPositions ?? [],
    playing: playing ?? true,
  };
});

/** Redirects to sign-in, the waiting screen, or the blocked screen; otherwise returns the Approved User. */
export async function requireApprovedUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (user.accessState === "pending") redirect("/waiting-for-approval");
  if (user.accessState === "blocked") redirect("/blocked");
  return user;
}

/**
 * For pages and Server Actions only Committee and Admins may use. Call it inside every such
 * action: a page's own check doesn't protect the actions defined in it, which are POST endpoints.
 */
export async function requireCommittee(): Promise<CurrentUser> {
  const user = await requireApprovedUser();
  if (!isCommitteeOrAbove(user.role)) redirect("/");
  return user;
}

/** As `requireCommittee`, for Admins only. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireApprovedUser();
  if (!canManageUsers(user.role)) redirect("/");
  return user;
}
