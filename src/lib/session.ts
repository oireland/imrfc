import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { AccessState, Role } from "@/features/users";
import { auth } from "./auth";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  accessState: AccessState;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, email, role, accessState } = session.user as typeof session.user &
    CurrentUser;
  return { id, name, email, role, accessState };
}

/** Redirects to sign-in, the waiting screen, or the blocked screen; otherwise returns the Approved User. */
export async function requireApprovedUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (user.accessState === "pending") redirect("/waiting-for-approval");
  if (user.accessState === "blocked") redirect("/blocked");
  return user;
}
