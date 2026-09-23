import { redirect } from "next/navigation";
import { db } from "@/db/client";
import {
  approveUser,
  blockUser,
  canManageUsers,
  listPendingUsers,
  type PendingUser,
} from "@/features/users";
import { getCurrentUser } from "@/lib/session";
import { revalidatePath } from "next/cache";

export default async function PendingUsersPage() {
  const user = await getCurrentUser();
  if (!user || !canManageUsers(user.role)) redirect("/");

  const pending = await listPendingUsers(db);

  async function approve(formData: FormData) {
    "use server";
    await approveUser(db, String(formData.get("userId")));
    revalidatePath("/admin/users");
  }

  async function block(formData: FormData) {
    "use server";
    await blockUser(db, String(formData.get("userId")));
    revalidatePath("/admin/users");
  }

  return (
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
  );
}
