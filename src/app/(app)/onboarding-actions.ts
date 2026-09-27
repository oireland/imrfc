"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { RUGBY_POSITIONS, setName, setPreferredPosition, type RugbyPosition } from "@/features/users";
import { requireApprovedUser } from "@/lib/session";

export type OnboardingState = { ok: true } | { ok: false; error: string } | null;

function isRugbyPosition(value: string): value is RugbyPosition {
  return (RUGBY_POSITIONS as readonly string[]).includes(value);
}

export async function completeOnboarding(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const current = await requireApprovedUser();
  const name = String(formData.get("name") ?? "");
  const position = String(formData.get("position") ?? "");

  const nameResult = await setName(db, current.id, name);
  if (!nameResult.ok) return nameResult;
  if (!isRugbyPosition(position)) return { ok: false, error: "Please choose your position." };

  await setPreferredPosition(db, current.id, position);
  revalidatePath("/", "layout");
  return { ok: true };
}
