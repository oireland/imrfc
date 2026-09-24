import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { db } from "@/db/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatWhen } from "@/lib/format-time";
import { listUpcomingDutiesForUser, markUnconfirmed } from "@/features/duties";
import { listNextEvents } from "@/features/events";
import { listKitHeldBy, listKitUnits } from "@/features/kit";
import { requireApprovedUser } from "@/lib/session";

const CARD_TITLE_CLASS = "font-heading text-base leading-snug font-medium";

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
    <div className="flex flex-col gap-4">
      <section aria-labelledby="my-duties">
        <Card>
          <CardHeader>
            <h2 id="my-duties" className={CARD_TITLE_CLASS}>
              My Duties
            </h2>
          </CardHeader>
          <CardContent className="p-0">
            {duties.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted-foreground">
                No Duties — claim one from an Event.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {duties.map(({ duty, event }) => (
                  <li key={duty.id}>
                    <Link
                      href={`/events/${event.id}`}
                      className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-muted"
                    >
                      <span className="flex flex-col">
                        <span className="font-medium">{event.title}</span>
                        <span className="text-sm">
                          {duty.direction === "to" ? "Bring" : "Take away"} {kitNames.get(duty.kitUnitId) ?? "Kit Unit"}
                        </span>
                        <span className="text-xs text-muted-foreground">{formatWhen(event.start)}</span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="next-events">
        <Card>
          <CardHeader>
            <h2 id="next-events" className={CARD_TITLE_CLASS}>
              Next Events
            </h2>
          </CardHeader>
          <CardContent className="p-0">
            {events.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted-foreground">No upcoming Events.</p>
            ) : (
              <ul className="divide-y divide-border">
                {events.map((event) => (
                  <li key={event.id}>
                    <Link
                      href={`/events/${event.id}`}
                      className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-muted"
                    >
                      <span className="flex flex-col">
                        <span className="font-medium">{event.title}</span>
                        <span className="text-xs text-muted-foreground">{formatWhen(event.start)}</span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="kit-i-hold">
        <Card>
          <CardHeader>
            <h2 id="kit-i-hold" className={CARD_TITLE_CLASS}>
              Kit I Hold
            </h2>
          </CardHeader>
          <CardContent className="p-0">
            {held.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted-foreground">
                You&apos;re not holding any Kit Units.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {held.map((unit) => (
                  <li key={unit.id}>
                    <Link
                      href={`/kit/${unit.id}`}
                      className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-muted"
                    >
                      <span className="font-medium">{unit.name}</span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
