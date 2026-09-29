import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { announce, askPush, chaseMessage, getAvailability, nudge, saveReply, type ReplyStatus } from "@/features/availability";
import { londonToUtc } from "@/features/events";
import { sendToUser } from "@/features/push";
import { isCommitteeOrAbove } from "@/features/users";
import { getMailSender } from "@/lib/mail";
import { getPushSender } from "@/lib/push";
import { requireApprovedUser, type CurrentUser } from "@/lib/session";
import { AvailabilityCard } from "./availability-card";

async function currentViewer() {
  const current = await requireApprovedUser();
  return { id: current.id, committee: isCommitteeOrAbove(current.role) };
}

/** Event detail's Availability slot, contributed by the `availability` feature. Renders nothing for Socials. */
export async function AvailabilitySlot({ eventId, viewer }: { eventId: string; viewer: CurrentUser }) {
  const committee = isCommitteeOrAbove(viewer.role);
  const now = new Date();
  const availability = await getAvailability(db, eventId, { id: viewer.id, committee }, now);
  if (!availability.takesReplies) return null;

  const host = (await headers()).get("host");
  const url = `${host?.startsWith("localhost") ? "http" : "https"}://${host}/events/${eventId}`;

  async function reply(playerId: string, answer: { status: ReplyStatus; note: string; reason: string }) {
    "use server";
    const result = await saveReply(db, { eventId, playerId, viewer: await currentViewer(), ...answer });
    revalidatePath(`/events/${eventId}`);
    return result;
  }

  async function announceAction(replyBy: { date: string; time: string } | null) {
    "use server";
    const result = await announce(db, {
      eventId,
      viewer: await currentViewer(),
      replyBy: replyBy ? londonToUtc(replyBy.date, replyBy.time) : null,
      url,
      mail: getMailSender(),
    });
    if (result.ok) {
      const message = { ...askPush({ kind: "announce", events: availability.events }), url: `/events/${eventId}` };
      await Promise.all(result.reachedUserIds.map((userId) => sendToUser(db, userId, message, getPushSender())));
    }
    revalidatePath(`/events/${eventId}`);
    return result;
  }

  async function nudgeAction(playerIds: string[]) {
    "use server";
    const result = await nudge(db, { eventId, viewer: await currentViewer(), playerIds, url, mail: getMailSender() });
    if (result.ok) {
      const message = { ...askPush({ kind: "nudge", events: availability.events }), url: `/events/${eventId}` };
      await Promise.all(result.reachedUserIds.map((userId) => sendToUser(db, userId, message, getPushSender())));
    }
    revalidatePath(`/events/${eventId}`);
    return result;
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
      reply={reply}
      announce={announceAction}
      nudge={nudgeAction}
    />
  );
}
