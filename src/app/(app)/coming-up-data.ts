import { db } from "@/db/client";
import type { CalendarEvent } from "@/components/coming-up";
import { listUpcomingDutiesForUser } from "@/features/duties";
import { listEventsBetween } from "@/features/events";
import { listLocations, type Location } from "@/features/locations";
import { londonDay } from "@/lib/calendar";

/**
 * What the "What's coming up" calendar needs: Events from three months back to a year
 * ahead (enough to page through), the User's own Duties marked, and the Venues for quick add.
 */
export async function loadComingUp(userId: string) {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
  const to = new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth() + 1, 1));
  const [events, locations, duties] = await Promise.all([
    listEventsBetween(db, from, to),
    listLocations(db),
    listUpcomingDutiesForUser(db, userId),
  ]);
  const venueName = new Map(locations.map((l: Location) => [l.id, l.name]));
  const mine = new Set(duties.map(({ event }) => event.id));

  return {
    now: now.getTime(),
    today: londonDay(now),
    venues: locations.filter((l: Location) => l.isVenue).map((l: Location) => ({ id: l.id, name: l.name })),
    events: events.map(
      (e): CalendarEvent => ({
        id: e.id,
        title: e.title,
        type: e.eventType,
        start: e.start.toISOString(),
        end: e.end.toISOString(),
        venue: venueName.get(e.venueId) ?? "",
        cancelled: e.cancelled,
        mine: mine.has(e.id),
      }),
    ),
  };
}
