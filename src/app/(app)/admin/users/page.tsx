import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { releaseDutiesOfBlockedUser } from "@/features/duties";
import {
  approveUser,
  blockUser,
  canManageUsers,
  listApprovedUsers,
  listPendingUsers,
  setRole,
  unblockUser,
  type PendingUser,
  type Role,
} from "@/features/users";
import { getCurrentUser } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { RoleSelect } from "./role-select";

export default async function UsersAdminPage() {
  const user = await getCurrentUser();
  if (!user || !canManageUsers(user.role)) redirect("/");

  const [pending, approved] = await Promise.all([listPendingUsers(db), listApprovedUsers(db)]);

  async function approve(formData: FormData) {
    "use server";
    await approveUser(db, String(formData.get("userId")));
    revalidatePath("/admin/users");
  }

  async function block(formData: FormData) {
    "use server";
    const userId = String(formData.get("userId"));
    await blockUser(db, userId);
    await releaseDutiesOfBlockedUser(db, userId);
    revalidatePath("/admin/users");
  }

  async function unblock(formData: FormData) {
    "use server";
    await unblockUser(db, String(formData.get("userId")));
    revalidatePath("/admin/users");
  }

  async function changeRole(formData: FormData) {
    "use server";
    await setRole(db, String(formData.get("userId")), formData.get("role") as Role);
    revalidatePath("/admin/users");
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Pending Users</h2>
        {pending.length === 0 && <p className="text-muted-foreground">Nobody waiting.</p>}
        <ul className="flex flex-col gap-2">
          {pending.map((p: PendingUser) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-md border border-border p-3"
            >
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-sm text-muted-foreground">{p.email}</p>
              </div>
              <div className="flex gap-2">
                <form action={approve}>
                  <input type="hidden" name="userId" value={p.id} />
                  <button className="rounded-md bg-primary px-3 py-1 text-primary-foreground">
                    Approve
                  </button>
                </form>
                <form action={block}>
                  <input type="hidden" name="userId" value={p.id} />
                  <button className="rounded-md bg-destructive px-3 py-1 text-destructive-foreground">
                    Block
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Users & Roles</h2>
        {approved.length === 0 && <p className="text-muted-foreground">No Users yet.</p>}
        <ul className="flex flex-col gap-2">
          {approved.map((p: PendingUser) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-md border border-border p-3"
            >
              <div>
                <p className="font-medium">
                  {p.name}
                  {p.accessState === "blocked" && (
                    <span className="ml-2 text-xs font-semibold text-destructive">Blocked</span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">{p.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <form action={changeRole}>
                  <RoleSelect userId={p.id} role={p.role as Role} />
                </form>
                {p.accessState === "blocked" ? (
                  <form action={unblock}>
                    <input type="hidden" name="userId" value={p.id} />
                    <button className="rounded-md bg-primary px-3 py-1 text-primary-foreground">
                      Unblock
                    </button>
                  </form>
                ) : (
                  <form action={block}>
                    <input type="hidden" name="userId" value={p.id} />
                    <button className="rounded-md bg-destructive px-3 py-1 text-destructive-foreground">
                      Block
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
