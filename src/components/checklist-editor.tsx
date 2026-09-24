import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
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

const field = "rounded-md border border-border bg-background px-2 py-1";

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
    <div className="flex flex-col gap-2 text-sm">
      {own === undefined ? (
        <p className="text-muted-foreground">
          No Checklist of its own{inheritedFrom ? ` — uses the ${inheritedFrom}` : ""}.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-1">
            {own.map((id) => (
              <li key={id} className="flex items-center justify-between">
                {names.get(id) ?? id}
                <form action={remove}>
                  <input type="hidden" name="kitUnitId" value={id} />
                  <button className="text-destructive underline">Remove</button>
                </form>
              </li>
            ))}
            {own.length === 0 && <li className="text-muted-foreground">Empty Checklist.</li>}
          </ul>
          <form action={clear}>
            <button className="underline">Stop overriding</button>
          </form>
        </>
      )}
      <form action={add} className="flex gap-2">
        <select name="kitUnitId" required className={field}>
          <option value="">Add Kit Unit...</option>
          {active
            .filter((u) => !own?.includes(u.id))
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
        </select>
        <button className="rounded-md bg-primary px-3 py-1 text-primary-foreground">Add</button>
      </form>
    </div>
  );
}
