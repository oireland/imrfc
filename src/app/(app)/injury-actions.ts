"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { clearInjury, logByMistake, reportInjury, updateInjury, type InjuryAlert, type ReportInput, type UpdateInput } from "@/features/injuries";
import { londonDay } from "@/lib/time/london";
import { sendToUser } from "@/features/push";
import { getPushSender } from "@/lib/messaging/push";
import { requireApprovedUser } from "@/lib/auth/session";
import type { Result } from "@/lib/result";


/** Push Committee once the response has gone ("Jo King is now Out"), opening the Player's page. */
function alertCommittee(alert: InjuryAlert | null) {
  if (!alert) return;
  after(async () => {
    const message = { title: alert.title, body: alert.body, url: `/players/${alert.playerId}` };
    await Promise.all(alert.userIds.map((userId) => sendToUser(db, userId, message, getPushSender())));
  });
}

function refresh() {
  revalidatePath("/", "layout");
}

export async function reportInjuryAction(userId: string, input: ReportInput): Promise<Result> {
  const result = await reportInjury(db, await requireApprovedUser(), userId, input, londonDay());
  if (!result.ok) return result;
  alertCommittee(result.alert);
  refresh();
  return { ok: true };
}

export async function updateInjuryAction(id: string, input: UpdateInput): Promise<Result> {
  const result = await updateInjury(db, await requireApprovedUser(), id, input, londonDay());
  if (!result.ok) return result;
  alertCommittee(result.alert);
  refresh();
  return { ok: true };
}

export async function clearInjuryAction(id: string): Promise<Result> {
  const result = await clearInjury(db, await requireApprovedUser(), id);
  if (result.ok) refresh();
  return result;
}

export async function logByMistakeAction(id: string): Promise<Result> {
  const result = await logByMistake(db, await requireApprovedUser(), id);
  if (result.ok) refresh();
  return result;
}
