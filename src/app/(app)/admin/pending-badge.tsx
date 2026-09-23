import Link from "next/link";
import { db } from "@/db/client";
import { canManageUsers, listPendingUsers } from "@/features/users";
import { getCurrentUser } from "@/lib/session";

export async function PendingBadge() {
  const user = await getCurrentUser();
  if (!user || !canManageUsers(user.role)) return null;

  const pending = await listPendingUsers(db);
  if (pending.length === 0) return null;

  return (
    <Link
      href="/admin/users"
      className="ml-auto flex items-center gap-1 rounded-full bg-accent px-2 py-1 text-xs font-semibold text-accent-foreground"
    >
      {pending.length} pending
    </Link>
  );
}
