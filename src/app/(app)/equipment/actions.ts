"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  createEquipmentUnit,
  getEquipmentUnit,
  loadPortions,
  parsePlaceKey,
  quickMoveFor,
  recordMove,
  type MoveTarget,
} from "@/features/equipment";
import { filterApprovedUserIds, isCommitteeOrAbove } from "@/features/users";
import { requireApprovedUser } from "@/lib/auth/session";
import type { Result } from "@/lib/result";

/** Adds an Equipment Unit from the Equipment page's sheet. Committee and above only. */
export async function addEquipmentUnit(input: {
  name: string;
  homeId: string;
  quantity?: number;
}): Promise<Result<{ id: string }>> {
  const user = await requireApprovedUser();
  if (!isCommitteeOrAbove(user.role)) return { ok: false, error: "Only Committee can add equipment." };
  const result = await createEquipmentUnit(db, { ...input, addedBy: user.id });
  if (!result.ok) return result;
  revalidatePath("/equipment");
  return { ok: true, id: result.equipmentUnit.id };
}

function revalidateEquipment(equipmentUnitId: string) {
  revalidatePath(`/equipment/${equipmentUnitId}`);
  revalidatePath("/equipment");
}

/** The one-tap Move on a Portion row: return it Home if I hold it, otherwise "I've got it". */
export async function quickMove(formData: FormData) {
  const { id: userId } = await requireApprovedUser();
  const equipmentUnitId = String(formData.get("equipmentUnitId"));
  const portionId = String(formData.get("portionId"));
  const [unit, portions] = await Promise.all([getEquipmentUnit(db, equipmentUnitId), loadPortions(db, equipmentUnitId)]);
  const portion = portions.find((p) => p.id === portionId);
  if (!unit || !portion) return;
  const count = formData.get("count");
  const move = quickMoveFor({ unit, portion }, userId, count ? Number(count) : undefined);
  await recordMove(db, equipmentUnitId, userId, move.to, "ad_hoc", { count: move.count, from: move.from });
  revalidateEquipment(equipmentUnitId);
}

/** Moves `count` from `from` (both read from the form) to `target`, as the signed-in User. */
async function moveFromForm(formData: FormData, target: MoveTarget) {
  const { id: userId } = await requireApprovedUser();
  const equipmentUnitId = String(formData.get("equipmentUnitId"));
  const from = parsePlaceKey(String(formData.get("from")));
  await recordMove(db, equipmentUnitId, userId, target, "ad_hoc", { count: Number(formData.get("count")), from });
  revalidateEquipment(equipmentUnitId);
}

export async function giveTo(formData: FormData) {
  await requireApprovedUser();
  const holderId = String(formData.get("holderId"));
  if (!Number(formData.get("count")) || !(await filterApprovedUserIds(db, [holderId])).has(holderId)) return;
  await moveFromForm(formData, { type: "holder", holderId });
}

export async function putInStore(formData: FormData) {
  await requireApprovedUser();
  if (!Number(formData.get("count"))) return;
  await moveFromForm(formData, { type: "store", storeId: String(formData.get("storeId")) });
}
