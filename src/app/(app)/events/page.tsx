import Link from "next/link";
import { db } from "@/db/client";
import { listEvents, type Event } from "@/features/events";
import { requireApprovedUser } from "@/lib/session";

export default async function EventsPage({
  searchParams,
}: PageProps<"/events">) {
  await requireApprovedUser();
  const { tab } = await searchParams;
  const when = tab === "past" ? "past" : "upcoming";

  const events = await listEvents(db, { when });

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold">Events</h2>

      <div className="flex gap-2">
        <Link
          href="/events?tab=upcoming"
          className={`rounded-md px-3 py-1 text-sm ${when === "upcoming" ? "bg-primary text-primary-foreground" : "border border-border"}`}
        >
          Upcoming
        </Link>
        <Link
          href="/events?tab=past"
          className={`rounded-md px-3 py-1 text-sm ${when === "past" ? "bg-primary text-primary-foreground" : "border border-border"}`}
        >
          Past
        </Link>
      </div>

      <ul className="flex flex-col gap-2">
        {events.length === 0 && <p className="text-muted-foreground">No Events.</p>}
        {events.map((e: Event) => (
          <li key={e.id} className="rounded-md border border-border p-3">
            <Link href={`/events/${e.id}`} className="font-medium underline">
              {e.title}
            </Link>
            {e.cancelled && (
              <span className="ml-2 rounded-md bg-destructive px-1.5 py-0.5 text-xs text-destructive-foreground">
                Cancelled
              </span>
            )}
            <p className="text-sm text-muted-foreground">
              {e.start.toLocaleString?.("en-GB", { timeZone: "Europe/London" }) ?? String(e.start)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
