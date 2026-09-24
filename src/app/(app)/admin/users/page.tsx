import { redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
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
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
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
    <div className="flex flex-col gap-6 p-4">
      <div className="flex flex-col gap-1">
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Admin
        </Link>
        <h2 className="text-xl font-semibold">Users</h2>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-muted-foreground">Pending Users</h3>
        <Card className="py-0">
          <div className="divide-y divide-border">
            {pending.length === 0 && <p className="p-4 text-muted-foreground">Nobody waiting.</p>}
            {pending.map((p: PendingUser) => {
              const blockFormId = `block-pending-${p.id}`;
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-sm text-muted-foreground">{p.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <form action={approve}>
                      <input type="hidden" name="userId" value={p.id} />
                      <SubmitButton size="sm">Approve</SubmitButton>
                    </form>
                    <form id={blockFormId} action={block}>
                      <input type="hidden" name="userId" value={p.id} />
                    </form>
                    <ConfirmSubmit
                      formId={blockFormId}
                      triggerLabel="Block"
                      triggerSize="sm"
                      title="Block User?"
                      description={`${p.name} will lose access immediately.`}
                      confirmLabel="Block"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-muted-foreground">Users & Roles</h3>
        <Card className="py-0">
          <div className="divide-y divide-border">
            {approved.length === 0 && <p className="p-4 text-muted-foreground">No Users yet.</p>}
            {approved.map((p: PendingUser) => {
              const blockFormId = `block-approved-${p.id}`;
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{p.name}</p>
                      {p.accessState === "blocked" && <Badge variant="destructive">Blocked</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{p.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <form action={changeRole}>
                      <RoleSelect userId={p.id} userName={p.name} role={p.role as Role} />
                    </form>
                    {p.accessState === "blocked" ? (
                      <form action={unblock}>
                        <input type="hidden" name="userId" value={p.id} />
                        <SubmitButton size="sm">Unblock</SubmitButton>
                      </form>
                    ) : (
                      <>
                        <form id={blockFormId} action={block}>
                          <input type="hidden" name="userId" value={p.id} />
                        </form>
                        <ConfirmSubmit
                          formId={blockFormId}
                          triggerLabel="Block"
                          triggerSize="sm"
                          title="Block User?"
                          description={`${p.name} will lose access immediately.`}
                          confirmLabel="Block"
                        />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
