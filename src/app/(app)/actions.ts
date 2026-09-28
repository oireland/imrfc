"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { saveReply, type ReplyStatus } from "@/features/availability";
import { buildQuickEvent, buildQuickSeries, createEvent, createSeries, type QuickEventInput } from "@/features/events";
import { isCommitteeOrAbove, setThemePreference, type ThemePreference } from "@/features/users";
import { requireApprovedUser } from "@/lib/session";

/** Saves the colour theme chosen from the crest menu. */
export async function setTheme(theme: ThemePreference) {
  const user = await requireApprovedUser();
  if (!["system", "light", "dark"].includes(theme)) return;
  await setThemePreference(db, user.id, theme);
  revalidatePath("/", "layout");
}

/** Creates an Event from the calendar's tap-a-day sheet. Committee and above only. */
export async function quickAddEvent(input: QuickEventInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireApprovedUser();
  if (!isCommitteeOrAbove(user.role)) return { ok: false, error: "Only Committee can add Events." };
  if ((input.type === "training" || input.type === "social") && input.repeatUntil) {
    const series = await createSeries(db, buildQuickSeries({ ...input, type: input.type, repeatUntil: input.repeatUntil }));
    if (!series.ok) return series;
    revalidatePath("/");
    revalidatePath("/events");
    return { ok: true, id: series.series.id };
  }
  const result = await createEvent(db, buildQuickEvent(input));
  if (!result.ok) return result;
  revalidatePath("/");
  revalidatePath("/events");
  return { ok: true, id: result.event.id };
}

/** Answers a "Can you make it?" card on Home with the User's own reply. */
export async function replyFromHome(
  eventId: string,
  answer: { status: ReplyStatus; note: string; reason: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireApprovedUser();
  const result = await saveReply(db, { eventId, playerId: user.id, viewer: { id: user.id, committee: isCommitteeOrAbove(user.role) }, ...answer });
  revalidatePath("/");
  revalidatePath(`/events/${eventId}`);
  return result;
}
