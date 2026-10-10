import { db } from "@/db/client";
import { listEventsBetween } from "@/features/events";
import { formatDay } from "@/lib/format-time";

/** Training and Matches from the last three weeks, newest first, for "Happened at…". */
export async function recentEventOptions(now: Date = new Date()) {
  const events = await listEventsBetween(db, new Date(now.getTime() - 21 * 86_400_000), now);
  return events
    .filter((e) => (e.eventType === "training" || e.eventType === "match") && !e.cancelled)
    .sort((a, b) => b.start.getTime() - a.start.getTime())
    .map((e) => ({ id: e.id, label: `${e.title} · ${formatDay(e.start)}` }));
}
