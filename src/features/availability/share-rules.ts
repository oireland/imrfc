// The WhatsApp text Committee post in the club group to ask who's available. Pure, so the
// sheet can rebuild it as the Reply By changes.
import { formatDay, formatWhen } from "@/lib/time/format-time";
import { londonParts } from "@/lib/time/london";

export type ShareEvent = {
  title: string;
  start: Date;
  end: Date;
  startTbc: boolean;
  venue: string | null;
  meetTime: Date | null;
  travelMeetTime: Date | null;
  travelMeetPoint: string | null;
};

const clock = (d: Date) => londonParts(d).time;

/** "Mon 30 Nov, 17:15–19:00", or with the end's day when it isn't the same London day. */
function when(e: ShareEvent): string {
  if (e.startTbc) return `${formatDay(e.start)}, time TBC`;
  if (londonParts(e.start).date === londonParts(e.end).date) return `${formatDay(e.start)}, ${clock(e.start)}–${clock(e.end)}`;
  return `${formatWhen(e.start, e.start)} – ${formatWhen(e.end, e.start)}`;
}

function block(e: ShareEvent): string[] {
  return [
    e.title,
    when(e),
    ...(e.meetTime ? [`Meet at venue: ${clock(e.meetTime)}`] : []),
    ...(e.travelMeetTime ? [`Transport meet: ${clock(e.travelMeetTime)}${e.travelMeetPoint ? ` at ${e.travelMeetPoint}` : ""}`] : []),
    ...(e.venue ? [`Venue: ${e.venue}`] : []),
  ];
}

/** The announcement for one Event, or every Match of a day. */
export function shareMessage({ events, replyBy, url }: { events: ShareEvent[]; replyBy: Date | null; url: string }): string {
  return [
    "Availability time fellas:",
    ...events.flatMap((e) => ["", ...block(e)]),
    "",
    ...(replyBy ? [`Reply by ${formatWhen(replyBy, events[0].start)}.`] : []),
    `Reply on the app: ${url}`,
  ].join("\n");
}
