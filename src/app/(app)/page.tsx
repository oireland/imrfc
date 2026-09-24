import Link from "next/link";
import { db } from "@/db/client";
import { listUpcomingDutiesForUser, markUnconfirmed } from "@/features/duties";
import { listNextEvents } from "@/features/events";
import { listKitHeldBy, listKitUnits } from "@/features/kit";
import { requireApprovedUser } from "@/lib/session";

function formatTime(d: Date) {
  return d.toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" });
}

export default async function Home() {
  const user = await requireApprovedUser();

  await markUnconfirmed(db);
  const [duties, events, held] = await Promise.all([
    listUpcomingDutiesForUser(db, user.id),
    listNextEvents(db, 5),
    listKitHeldBy(db, user.id),
  ]);
  const kitNames = new Map((await listKitUnits(db, { includeRetired: true })).map((k) => [k.id, k.name]));

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2" aria-labelledby="my-duties">
        <h2 id="my-duties" className="text-xl font-semibold">
          My Duties
        </h2>
        {duties.length === 0 && <p className="text-muted-foreground">No Duties coming up.</p>}
        <ul className="flex flex-col gap-2">
          {duties.map(({ duty, event }) => (
            <li key={duty.id} className="rounded-md border border-border border-l-4 border-l-accent p-3">
              <Link href={`/events/${event.id}`} className="font-medium underline">
                {event.title}
              </Link>
              <p className="text-sm">
                {duty.direction === "to" ? "Bring" : "Take away"} {kitNames.get(duty.kitUnitId) ?? "Kit Unit"}
              </p>
              <p className="text-xs text-muted-foreground">{formatTime(event.start)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="next-events">
        <h2 id="next-events" className="text-xl font-semibold">
          Next Events
        </h2>
        {events.length === 0 && <p className="text-muted-foreground">No upcoming Events.</p>}
        <ul className="flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.id} className="rounded-md border border-border p-3">
              <Link href={`/events/${event.id}`} className="font-medium underline">
                {event.title}
              </Link>
              <p className="text-xs text-muted-foreground">{formatTime(event.start)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="kit-i-hold">
        <h2 id="kit-i-hold" className="text-xl font-semibold">
          Kit I Hold
        </h2>
        {held.length === 0 && <p className="text-muted-foreground">You aren&apos;t holding any Kit Units.</p>}
        <ul className="flex flex-col gap-2">
          {held.map((unit) => (
            <li key={unit.id} className="rounded-md border border-border p-3">
              <Link href={`/kit/${unit.id}`} className="font-medium underline">
                {unit.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
