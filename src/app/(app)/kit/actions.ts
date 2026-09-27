"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { createKitUnit } from "@/features/kit";
import { isCommitteeOrAbove } from "@/features/users";
import { requireApprovedUser } from "@/lib/session";

/** Adds a Kit Unit from the Kit page's sheet. Committee and above only. */
export async function addKitUnit(input: {
  name: string;
  homeId: string;
  quantity?: number;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireApprovedUser();
  if (!isCommitteeOrAbove(user.role)) return { ok: false, error: "Only Committee can add kit." };
  const result = await createKitUnit(db, input);
  if (!result.ok) return result;
  revalidatePath("/kit");
  return { ok: true, id: result.kitUnit.id };
}
