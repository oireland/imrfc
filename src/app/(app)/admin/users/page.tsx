import { redirect } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { deleteAccount } from "@/features/account-deletion";
import { releaseUpcomingDuties } from "@/features/duties";
import {
  approveUser,
  blockUserAs,
  changeRole as changeRoleFor,
  listKnownUsers,
  listPendingUsers,
  unblockUser,
  type PendingUser,
  type Role,
} from "@/features/users";
import { requireAdmin } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import { RoleSelect } from "./role-select";

function DeleteAccountButton({ person, action }: { person: PendingUser; action: (formData: FormData) => Promise<void> }) {
  const formId = `delete-${person.id}`;
  return (
    <>
      <form id={formId} action={action}>
        <input type="hidden" name="userId" value={person.id} />
      </form>
      <ConfirmSubmit
        formId={formId}
        triggerLabel="Delete"
        triggerVariant="outline"
        triggerSize="sm"
        title={`Delete ${person.name || person.email}'s account?`}
        description="This can't be undone. Their name, email and sign-in are wiped and they're taken off upcoming duties. Anything they've done stays in the club's records as “Deleted user”."
        confirmLabel="Yes, delete it"
      />
    </>
  );
}

export default async function UsersAdminPage() {
  await requireAdmin();

  const [pending, everyone] = await Promise.all([listPendingUsers(db), listKnownUsers(db)]);
  const approved = everyone.filter((p: PendingUser) => p.accessState !== "deleted");

  async function approve(formData: FormData) {
    "use server";
    await requireAdmin();
    await approveUser(db, String(formData.get("userId")));
    revalidatePath("/admin/users");
  }

  async function block(formData: FormData) {
    "use server";
    const current = await requireAdmin();
    const userId = String(formData.get("userId"));
    const result = await blockUserAs(db, { actorId: current.id, userId });
    if (!result.ok) redirect(`/admin/users?error=${result.code}`);
    await releaseUpcomingDuties(db, userId);
    revalidatePath("/admin/users");
  }

  async function unblock(formData: FormData) {
    "use server";
    await requireAdmin();
    await unblockUser(db, String(formData.get("userId")));
    revalidatePath("/admin/users");
  }

  async function remove(formData: FormData) {
    "use server";
    const current = await requireAdmin();
    const result = await deleteAccount(db, { actor: current, userId: String(formData.get("userId")) });
    if (!result.ok) redirect(`/admin/users?error=${result.code}`);
    revalidatePath("/admin/users");
  }

  async function changeRole(formData: FormData) {
    "use server";
    const current = await requireAdmin();
    const result = await changeRoleFor(db, { actorId: current.id, userId: String(formData.get("userId")), role: formData.get("role") });
    if (!result.ok) redirect(`/admin/users?error=${result.code}`);
    revalidatePath("/admin/users");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <BackLink href="/admin">Admin</BackLink>
        <h2 className="font-heading text-[40px] leading-none tracking-tight">Users</h2>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-muted-foreground">Waiting for approval</h3>
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
                  <div className="flex flex-wrap justify-end gap-2">
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
                      title={`Block ${p.name}?`}
                      description={`${p.name} will lose access immediately.`}
                      confirmLabel="Block"
                    />
                    <DeleteAccountButton person={p} action={remove} />
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
            {approved.length === 0 && <p className="p-4 text-muted-foreground">Nobody yet.</p>}
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
                  <div className="flex flex-wrap items-center justify-end gap-2">
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
                          title={`Block ${p.name}?`}
                          description={`${p.name} will lose access immediately.`}
                          confirmLabel="Block"
                        />
                      </>
                    )}
                    {p.role !== "admin" && <DeleteAccountButton person={p} action={remove} />}
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
