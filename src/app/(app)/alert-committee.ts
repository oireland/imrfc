import { after } from "next/server";
import { db } from "@/db/client";
import { awayAlert } from "@/features/players";
import { sendToUser } from "@/features/push";
import { alertOnNotAvailable } from "@/features/selection";
import { getPushSender } from "@/lib/push";

type Alert = { title: string; body: string; userIds: string[] };

/** After the response has gone, loads an alert and pushes it to each Committee user it names, opening `url`. */
function pushCommitteeLater<A extends Alert>(load: () => Promise<A | null>, url: (alert: A) => string) {
  after(async () => {
    const alert = await load();
    if (!alert) return;
    const message = { title: alert.title, body: alert.body, url: url(alert) };
    await Promise.all(alert.userIds.map((userId) => sendToUser(db, userId, message, getPushSender())));
  });
}

/**
 * After a Player replies Not available: if they're on a named team, push Committee once the
 * response has gone ("Sam can't make Sat 4 Oct: at 4 for the 1st XV").
 */
export function alertCommitteeLater(input: { eventId: string; playerId: string }) {
  pushCommitteeLater(
    () => alertOnNotAvailable(db, input),
    (alert) => `/events/${alert.eventId}/selection`,
  );
}

/**
 * After time Away is added: if it starts within 14 days, push Committee once the response has gone
 * ("Jo King will be away from 20 Dec"), opening the Player's page.
 */
export function alertCommitteeOfAway(periodId: string) {
  pushCommitteeLater(
    () => awayAlert(db, periodId),
    (alert) => `/players/${alert.playerId}`,
  );
}
