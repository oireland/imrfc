import { db } from "@/db/client";
import type { CalendarEvent } from "@/components/coming-up";
import { listMyReplies } from "@/features/availability";
import { listUpcomingDutiesForUser } from "@/features/duties";
import { teamsForRequest } from "./request-cache";
import { listEventsBetween, listVenues } from "@/features/events";
import { londonDay } from "@/lib/calendar";

/**
 * What the "What's coming up" calendar needs: Events from three months back to a year
 * ahead (enough to page through), the User's own Duties and replies marked, and the venues
 * already used and the Teams, for the New event sheet. Pass `upcomingDuties` when the page has
 * already loaded the User's upcoming Duties, so they aren't loaded twice.
 */
export async function loadComingUp(userId: string, upcomingDuties?: Promise<{ event: { id: string } }[]>) {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
  const to = new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth() + 1, 1));
  const [events, venues, teams, duties] = await Promise.all([
    listEventsBetween(db, from, to),
    listVenues(db),
    teamsForRequest(),
    upcomingDuties ?? listUpcomingDutiesForUser(db, userId),
  ]);
  const mine = new Set(duties.map(({ event }) => event.id));
  const replies = await listMyReplies(db, userId, events, now);

  return {
    now: now.getTime(),
    today: londonDay(now),
    venues,
    teams: teams.map((t) => ({ id: t.id, name: t.name })),
    events: events.map(
      (e): CalendarEvent => ({
        id: e.id,
        title: e.title,
        type: e.eventType,
        start: e.start.toISOString(),
        end: e.end.toISOString(),
        startTbc: e.startTbc,
        venue: e.venue,
        cancelled: e.cancelled,
        mine: mine.has(e.id),
        reply: replies[e.id] ?? null,
      }),
    ),
  };
}
