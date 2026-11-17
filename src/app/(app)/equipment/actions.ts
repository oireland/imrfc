"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { createEquipmentUnit } from "@/features/equipment";
import { isCommitteeOrAbove } from "@/features/users";
import { requireApprovedUser } from "@/lib/session";

/** Adds an Equipment Unit from the Equipment page's sheet. Committee and above only. */
export async function addEquipmentUnit(input: {
  name: string;
  homeId: string;
  quantity?: number;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireApprovedUser();
  if (!isCommitteeOrAbove(user.role)) return { ok: false, error: "Only Committee can add equipment." };
  const result = await createEquipmentUnit(db, { ...input, addedBy: user.id });
  if (!result.ok) return result;
  revalidatePath("/equipment");
  return { ok: true, id: result.equipmentUnit.id };
}
