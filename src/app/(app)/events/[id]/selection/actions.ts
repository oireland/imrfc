"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/db/client";
import { sendToUser } from "@/features/push";
import { addShirt, clearShirt, deliverNotice, dismissNotice, nameTheTeam, pickGuest, pickPlayer, removeShirt, sendChanges, swapShirts } from "@/features/selection";
import { isCommitteeOrAbove } from "@/features/users";
import { getMailSender } from "@/lib/mail";
import { getPushSender } from "@/lib/push";
import { requireApprovedUser } from "@/lib/session";

type Ref = { eventId: string; shirt: number };

// Each Shirt saves on its own; the open boards then refresh within a few seconds (ADR 0005).
async function changed<T>(eventIds: string[], run: (viewer: { id: string; committee: boolean }) => Promise<T>): Promise<T> {
  const current = await requireApprovedUser();
  const result = await run({ id: current.id, committee: isCommitteeOrAbove(current.role) });
  for (const id of eventIds) revalidatePath(`/events/${id}/selection`);
  return result;
}

export async function pick(eventId: string, shirt: number, userId: string) {
  return changed([eventId], (viewer) => pickPlayer(db, { eventId, shirt, userId, viewer }));
}

export async function guest(eventId: string, shirt: number, name: string) {
  return changed([eventId], (viewer) => pickGuest(db, { eventId, shirt, name, viewer }));
}

export async function clear(eventId: string, shirt: number) {
  return changed([eventId], (viewer) => clearShirt(db, { eventId, shirt, viewer }));
}

export async function swap(from: Ref, to: Ref) {
  return changed([from.eventId, to.eventId], (viewer) => swapShirts(db, { from, to, viewer }));
}

export async function add(eventId: string) {
  return changed([eventId], (viewer) => addShirt(db, { eventId, viewer }));
}

export async function remove(eventId: string) {
  return changed([eventId], (viewer) => removeShirt(db, { eventId, viewer }));
}

/** Emails and pushes a notice's people once the response has gone, so Committee aren't kept waiting. */
async function deliverLater(noticeId: string, eventId: string) {
  const host = (await headers()).get("host");
  const url = `${host?.startsWith("localhost") ? "http" : "https"}://${host}/events/${eventId}`;
  after(async () => {
    const { reached } = await deliverNotice(db, noticeId, { url, mail: getMailSender() });
    await Promise.all(reached.map(({ userId, title, body }) => sendToUser(db, userId, { title, body, url: `/events/${eventId}` }, getPushSender())));
  });
}

/** After a notice is sent the Event, the board and Home all say something new. */
function sent(eventId: string) {
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/selection`);
  revalidatePath("/");
}

export async function nameTeam(eventId: string) {
  const current = await requireApprovedUser();
  const result = await nameTheTeam(db, { eventId, viewer: { id: current.id, committee: isCommitteeOrAbove(current.role) } });
  if (result.ok && result.noticeId) await deliverLater(result.noticeId, eventId);
  sent(eventId);
  return result;
}

export async function sendTeamChanges(eventId: string) {
  const current = await requireApprovedUser();
  const result = await sendChanges(db, { eventId, viewer: { id: current.id, committee: isCommitteeOrAbove(current.role) } });
  if (result.ok && result.noticeId) await deliverLater(result.noticeId, eventId);
  sent(eventId);
  return result;
}

export async function dismissTeamNotice(eventId: string, noticeId: string) {
  const current = await requireApprovedUser();
  const result = await dismissNotice(db, noticeId, { id: current.id, committee: isCommitteeOrAbove(current.role) });
  revalidatePath(`/events/${eventId}/selection`);
  return result;
}
