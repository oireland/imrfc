import { after } from "next/server";
import { db } from "@/db/client";
import { awayAlert } from "@/features/players";
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

/**
 * After time Away is added: if it starts within 14 days, push Committee once the response has gone
 * ("Jo King will be away from 20 Dec"), opening the Player's page.
 */
export function alertCommitteeOfAway(periodId: string) {
  after(async () => {
    const alert = await awayAlert(db, periodId);
    if (!alert) return;
    const message = { title: alert.title, body: alert.body, url: `/players/${alert.playerId}` };
    await Promise.all(alert.userIds.map((userId) => sendToUser(db, userId, message, getPushSender())));
  });
}
