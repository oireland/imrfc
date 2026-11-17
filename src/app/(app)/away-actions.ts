"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { addAway, editAway, imBack, removeAway, type AwayInput } from "@/features/players";
import { requireApprovedUser } from "@/lib/session";
import { alertCommitteeOfAway } from "./alert-committee";
import type { Result } from "@/lib/result";


function refresh() {
  revalidatePath("/", "layout");
}

export async function addAwayAction(userId: string, input: AwayInput): Promise<Result> {
  const actor = await requireApprovedUser();
  const result = await addAway(db, actor, userId, input);
  if (!result.ok) return result;
  alertCommitteeOfAway(result.id);
  refresh();
  return { ok: true };
}

export async function editAwayAction(id: string, input: AwayInput): Promise<Result> {
  const result = await editAway(db, await requireApprovedUser(), id, input);
  if (result.ok) refresh();
  return result;
}

export async function imBackAction(id: string): Promise<Result> {
  const result = await imBack(db, await requireApprovedUser(), id);
  if (result.ok) refresh();
  return result;
}

export async function removeAwayAction(id: string): Promise<Result> {
  const result = await removeAway(db, await requireApprovedUser(), id);
  if (result.ok) refresh();
  return result;
}
