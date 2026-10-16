import { revalidatePath } from "next/cache";
import { eventLink } from "@/lib/app-url";
import { after } from "next/server";
import { db } from "@/db/client";
import {
  announce,
  askPush,
  chaseMessage,
  deliverAsk,
  dismissAsk,
  getAvailability,
  markMessaged,
  nudge,
  retryAsk,
  saveReply,
  type AskedEvent,
  type ReplyStatus,
  whatsappMessage,
} from "@/features/availability";
import { listMobileNumbers, whatsappLink } from "@/features/contact";
import { londonToUtc } from "@/features/events";
import { sendToUser } from "@/features/push";
import { isCommitteeOrAbove } from "@/features/users";
import { getMailSender } from "@/lib/mail";
import { getPushSender } from "@/lib/push";
import { requireApprovedUser, type CurrentUser } from "@/lib/session";
import { alertCommitteeLater } from "@/app/(app)/alert-committee";
import { AvailabilityCard } from "./availability-card";

async function currentViewer() {
  const current = await requireApprovedUser();
  return { id: current.id, committee: isCommitteeOrAbove(current.role) };
}

/**
 * Sends an Announce or Nudge's emails, and pushes to whoever they reached, once the
 * response has gone, so Committee aren't kept waiting.
 */
function deliverLater(askId: string, kind: "announce" | "nudge", { eventId, url, events }: { eventId: string; url: string; events: AskedEvent[] }) {
  after(async () => {
    const { reachedUserIds } = await deliverAsk(db, askId, { url, mail: getMailSender() });
    const message = { ...askPush({ kind, events }), url: `/events/${eventId}` };
    await Promise.all(reachedUserIds.map((userId) => sendToUser(db, userId, message, getPushSender())));
  });
}

/** Event detail's Availability slot, contributed by the `availability` feature. Renders nothing for Socials. */
export async function AvailabilitySlot({ eventId, viewer }: { eventId: string; viewer: CurrentUser }) {
  const committee = isCommitteeOrAbove(viewer.role);
  const now = new Date();
  const availability = await getAvailability(db, eventId, { id: viewer.id, committee }, now);
  if (!availability.takesReplies) return null;

  const url = eventLink(eventId);

  async function reply(playerId: string, answer: { status: ReplyStatus; note: string; reason: string }) {
    "use server";
    const result = await saveReply(db, { eventId, playerId, viewer: await currentViewer(), ...answer });
    if (result.ok && answer.status === "not_available") alertCommitteeLater({ eventId, playerId });
    revalidatePath(`/events/${eventId}`);
    return result;
  }

  async function announceAction(replyBy: { date: string; time: string } | null) {
    "use server";
    const result = await announce(db, {
      eventId,
      viewer: await currentViewer(),
      replyBy: replyBy ? londonToUtc(replyBy.date, replyBy.time) : null,
    });
    if (result.ok) deliverLater(result.askId, "announce", { eventId, url, events: availability.events });
    revalidatePath(`/events/${eventId}`);
    return result;
  }

  async function nudgeAction(playerIds: string[]) {
    "use server";
    const result = await nudge(db, { eventId, viewer: await currentViewer(), playerIds });
    if (result.ok) deliverLater(result.askId, "nudge", { eventId, url, events: availability.events });
    revalidatePath(`/events/${eventId}`);
    return result;
  }

  async function dismissAction(askId: string) {
    "use server";
    const result = await dismissAsk(db, askId, await currentViewer());
    revalidatePath(`/events/${eventId}`);
    return result;
  }

  async function retryAction(askId: string) {
    "use server";
    const result = await retryAsk(db, askId, await currentViewer());
    const ask = availability.asks.find((a) => a.id === askId);
    if (result.ok && ask) deliverLater(askId, ask.kind, { eventId, url, events: availability.events });
    revalidatePath(`/events/${eventId}`);
    return result;
  }

  async function messagedAction(playerId: string) {
    "use server";
    const result = await markMessaged(db, { eventId, playerId, viewer: await currentViewer() });
    revalidatePath(`/events/${eventId}`);
    return result;
  }

  // Each No reply Player's prefilled WhatsApp chat, or null when they have no Mobile number.
  const whatsapp: Record<string, string | null> = {};
  if (availability.canMessage) {
    const noReply = availability.summary.noReply;
    const numbers = await listMobileNumbers(db, { id: viewer.id, role: viewer.role }, noReply.map((r) => r.userId));
    for (const row of noReply) {
      const number = numbers.get(row.userId);
      whatsapp[row.userId] = number ? whatsappLink(number, whatsappMessage({ events: availability.events, name: row.name, url })) : null;
    }
  }

  const chase =
    committee && availability.summary.noReply.length > 0
      ? chaseMessage({ events: availability.events, names: availability.summary.noReply.map((r) => r.name), url })
      : null;

  return (
    <AvailabilityCard
      availability={availability}
      viewerId={viewer.id}
      playing={viewer.playing}
      committee={committee}
      now={now}
      chase={chase}
      whatsapp={whatsapp}
      reply={reply}
      announce={announceAction}
      nudge={nudgeAction}
      dismiss={dismissAction}
      retry={retryAction}
      messaged={messagedAction}
    />
  );
}
