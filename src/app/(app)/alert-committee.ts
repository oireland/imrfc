import { after } from "next/server";
import { db } from "@/db/client";
import { sendToUser } from "@/features/push";
import { alertOnNotAvailable } from "@/features/selection";
import { getPushSender } from "@/lib/push";

/**
 * After a Player replies Not available: if they're on a named team, push Committee once the
 * response has gone ("Sam can't make Sat 4 Oct: at 4 for the 1st XV").
 */
export function alertCommitteeLater(input: { eventId: string; playerId: string }) {
  after(async () => {
    const alert = await alertOnNotAvailable(db, input);
    if (!alert) return;
    const message = { title: alert.title, body: alert.body, url: `/events/${alert.eventId}/selection` };
    await Promise.all(alert.userIds.map((userId) => sendToUser(db, userId, message, getPushSender())));
  });
}
