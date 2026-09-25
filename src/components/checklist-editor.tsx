import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { SubmitButton } from "@/components/submit-button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
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

/** Edits one level's own Checklist; `inheritedFrom` names the list that applies while it has none, e.g. "the default list". */
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
          {inheritedFrom ? `Using ${inheritedFrom}. Add kit to give it its own list.` : "Nothing on the list yet."}
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
            {own.length === 0 && <li className="py-1.5 text-muted-foreground">Nothing on the list yet.</li>}
          </ul>
          <form action={clear}>
            <SubmitButton variant="link" size="sm">
              {inheritedFrom ? `Go back to ${inheritedFrom}` : "Clear the list"}
            </SubmitButton>
          </form>
        </>
      )}
      <form action={add} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`add-kit-unit-${target.scopeId}`}>Add kit</Label>
          <NativeSelect id={`add-kit-unit-${target.scopeId}`} name="kitUnitId" required>
            <NativeSelectOption value="">Choose kit…</NativeSelectOption>
            {active
              .filter((u) => !own?.includes(u.id))
              .map((u) => (
                <NativeSelectOption key={u.id} value={u.id}>
                  {u.name}
                </NativeSelectOption>
              ))}
          </NativeSelect>
        </div>
        <SubmitButton>Add</SubmitButton>
      </form>
    </div>
  );
}
