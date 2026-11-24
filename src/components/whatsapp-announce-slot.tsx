import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { announceOnWhatsApp, getShare } from "@/features/availability";
import { isCommitteeOrAbove } from "@/features/users";
import { eventLink } from "@/lib/app-url";
import { requireApprovedUser, viewerOf, type CurrentUser } from "@/lib/auth/session";
import { londonToUtc } from "@/lib/time/london";
import { WhatsAppAnnounceButton } from "./whatsapp-announce-button";

/** Event detail's WhatsApp Announce button, for Committee. Renders nothing when there's nothing to announce. */
export async function WhatsAppAnnounceSlot({ eventId, viewer }: { eventId: string; viewer: CurrentUser }) {
  const share = await getShare(db, eventId, { id: viewer.id, committee: isCommitteeOrAbove(viewer.role) });
  if (!share) return null;

  async function announce(replyBy: { date: string; time: string } | null) {
    "use server";
    const result = await announceOnWhatsApp(db, {
      eventId,
      viewer: viewerOf(await requireApprovedUser()),
      replyBy: replyBy ? londonToUtc(replyBy.date, replyBy.time) : null,
    });
    revalidatePath(`/events/${eventId}`);
    return result;
  }

  return (
    <WhatsAppAnnounceButton
      events={share.events}
      url={eventLink(eventId)}
      announced={!!share.announcement}
      announcedReplyBy={share.announcement?.replyBy ?? null}
      announce={announce}
    />
  );
}
