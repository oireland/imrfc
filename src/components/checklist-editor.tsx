import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { PlainKitList } from "@/components/plain-kit-list";
import type { KitEditing } from "@/components/kit-editing";
import {
  addToChecklist,
  clearChecklist,
  effectiveCount,
  getChecklist,
  getInheritedChecklist,
  removeFromChecklist,
  setChecklistItemCount,
  type ChecklistScope,
} from "@/features/checklists";
import { listEquipmentUnits } from "@/features/equipment";
import { listStores } from "@/features/stores";
import { isCommitteeOrAbove } from "@/features/users";
import { requireApprovedUser } from "@/lib/session";
import type { Failure } from "@/lib/result";

async function refuseListChange(): Promise<Failure | null> {
  const user = await requireApprovedUser();
  return isCommitteeOrAbove(user.role) ? null : { ok: false, error: "Only Committee can change the list." };
}

/** Edits one level's own Checklist; `inheritedFrom` names the list that applies while it has none, e.g. "the default list". */
export async function ChecklistEditor({
  title,
  target,
  path,
  inheritedFrom,
}: {
  title: string;
  target: ChecklistScope;
  path: string;
  inheritedFrom?: string;
}) {
  const [own, inherited, units, stores] = await Promise.all([
    getChecklist(db, target),
    getInheritedChecklist(db, target),
    listEquipmentUnits(db),
    listStores(db),
  ]);
  const lines = own ?? inherited;
  const unitById = new Map(units.map((u) => [u.id, u]));

  async function add(equipmentUnitId: string, count: number | null) {
    "use server";
    const denied = await refuseListChange();
    if (denied) return denied;
    const result = await addToChecklist(db, target, equipmentUnitId, count);
    revalidatePath(path);
    return result;
  }
  async function remove(equipmentUnitId: string) {
    "use server";
    const denied = await refuseListChange();
    if (denied) return denied;
    await removeFromChecklist(db, target, equipmentUnitId);
    revalidatePath(path);
    return { ok: true as const };
  }
  async function setCount(equipmentUnitId: string, count: number | null) {
    "use server";
    const denied = await refuseListChange();
    if (denied) return denied;
    const result = await setChecklistItemCount(db, target, equipmentUnitId, count);
    revalidatePath(path);
    return result;
  }
  async function reset() {
    "use server";
    const denied = await refuseListChange();
    if (denied) return denied;
    await clearChecklist(db, target);
    revalidatePath(path);
    return { ok: true as const };
  }

  const kit: KitEditing = {
    options: units
      .filter((u) => u.status === "active" && !lines.some((l) => l.equipmentUnitId === u.id))
      .map((u) => ({ id: u.id, name: u.name, subtitle: stores.find((s) => s.id === u.homeId)?.name ?? "", quantity: u.quantity })),
    add,
    remove,
    setCount,
    reset: own && inheritedFrom ? { label: inheritedFrom, affected: [], run: reset } : undefined,
  };

  return (
    <PlainKitList
      title={title}
      kit={kit}
      note={own === undefined && inheritedFrom ? `Using ${inheritedFrom}. Change it to give this its own list.` : undefined}
      items={lines.map((l) => {
        const unit = unitById.get(l.equipmentUnitId);
        const quantity = unit?.quantity ?? 1;
        return {
          equipmentUnitId: l.equipmentUnitId,
          name: unit?.name ?? l.equipmentUnitId,
          quantity,
          count: effectiveCount(l.count, quantity),
          affected: [],
        };
      })}
    />
  );
}
