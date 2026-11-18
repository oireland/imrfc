"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { setMobileNumber } from "@/features/contact";
import { setPlayerPositions, setPlaying } from "@/features/players";
import type { RugbyPosition } from "@/features/users";
import { requireApprovedUser } from "@/lib/session";
import type { Result } from "@/lib/result";

// Shared by the Profile page (your own) and the Player page (Committee, anyone's).
// The features decide who may change whose.

function refresh() {
  revalidatePath("/", "layout");
}

export async function savePositionsAction(userId: string, preferred: RugbyPosition, other: RugbyPosition[]): Promise<Result> {
  const result = await setPlayerPositions(db, await requireApprovedUser(), userId, preferred, other);
  if (result.ok) refresh();
  return result;
}

export async function saveMobileNumberAction(userId: string, input: string): Promise<Result> {
  const result = await setMobileNumber(db, await requireApprovedUser(), userId, input);
  if (result.ok) refresh();
  return result;
}

export async function togglePlayingAction(userId: string, formData: FormData): Promise<void> {
  const result = await setPlaying(db, await requireApprovedUser(), userId, formData.get("playing") === "true");
  if (result.ok) refresh();
}
