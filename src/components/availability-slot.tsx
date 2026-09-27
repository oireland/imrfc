import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { getAvailability, saveReply, type ReplyStatus } from "@/features/availability";
import { isCommitteeOrAbove } from "@/features/users";
import { requireApprovedUser, type CurrentUser } from "@/lib/session";
import { AvailabilityCard } from "./availability-card";

/** Event detail's Availability slot, contributed by the `availability` feature. Renders nothing for Socials. */
export async function AvailabilitySlot({ eventId, viewer }: { eventId: string; viewer: CurrentUser }) {
  const committee = isCommitteeOrAbove(viewer.role);
  const availability = await getAvailability(db, eventId, { id: viewer.id, committee });
  if (!availability.takesReplies) return null;

  async function reply(playerId: string, answer: { status: ReplyStatus; note: string; reason: string }) {
    "use server";
    const current = await requireApprovedUser();
    const result = await saveReply(db, {
      eventId,
      playerId,
      viewer: { id: current.id, committee: isCommitteeOrAbove(current.role) },
      ...answer,
    });
    revalidatePath(`/events/${eventId}`);
    return result;
  }

  return <AvailabilityCard availability={availability} viewerId={viewer.id} playing={viewer.playing} committee={committee} reply={reply} />;
}
