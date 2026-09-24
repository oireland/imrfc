import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { SubmitButton } from "@/components/submit-button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  addToChecklist,
  clearChecklist,
  getChecklist,
  removeFromChecklist,
  type ChecklistScope,
} from "@/features/checklists";
import { listKitUnits } from "@/features/kit";
import { isCommitteeOrAbove } from "@/features/users";
import { requireApprovedUser } from "@/lib/session";

/** Edits one level's own Checklist; `inheritedFrom` says what applies while it has none. */
export async function ChecklistEditor({
  target,
  path,
  inheritedFrom,
}: {
  target: ChecklistScope;
  path: string;
  inheritedFrom?: string;
}) {
  const [own, units] = await Promise.all([getChecklist(db, target), listKitUnits(db)]);
  const active = units.filter((u) => u.status === "active");
  const names = new Map(units.map((u) => [u.id, u.name]));

  async function add(formData: FormData) {
    "use server";
    const user = await requireApprovedUser();
    if (!isCommitteeOrAbove(user.role)) return;
    await addToChecklist(db, target, String(formData.get("kitUnitId")));
    revalidatePath(path);
  }
  async function remove(formData: FormData) {
    "use server";
    const user = await requireApprovedUser();
    if (!isCommitteeOrAbove(user.role)) return;
    await removeFromChecklist(db, target, String(formData.get("kitUnitId")));
    revalidatePath(path);
  }
  async function clear() {
    "use server";
    const user = await requireApprovedUser();
    if (!isCommitteeOrAbove(user.role)) return;
    await clearChecklist(db, target);
    revalidatePath(path);
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      {own === undefined ? (
        <p className="text-muted-foreground">
          No Checklist of its own{inheritedFrom ? ` — uses the ${inheritedFrom}` : ""}.
        </p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-border">
            {own.map((id) => (
              <li key={id} className="flex items-center justify-between gap-2 py-1.5 first:pt-0">
                {names.get(id) ?? id}
                <form action={remove}>
                  <input type="hidden" name="kitUnitId" value={id} />
                  <SubmitButton variant="link" size="sm" className="text-destructive">
                    Remove
                  </SubmitButton>
                </form>
              </li>
            ))}
            {own.length === 0 && <li className="py-1.5 text-muted-foreground">No Kit Units yet.</li>}
          </ul>
          <form action={clear}>
            <SubmitButton variant="link" size="sm">
              Stop overriding
            </SubmitButton>
          </form>
        </>
      )}
      <form action={add} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`add-kit-unit-${target.scopeId}`}>Add Kit Unit</Label>
          <NativeSelect id={`add-kit-unit-${target.scopeId}`} name="kitUnitId" required>
            <option value="">Choose a Kit Unit…</option>
            {active
              .filter((u) => !own?.includes(u.id))
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </NativeSelect>
        </div>
        <SubmitButton>Add</SubmitButton>
      </form>
    </div>
  );
}
