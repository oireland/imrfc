import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { db } from "@/db/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatWhen } from "@/lib/format-time";
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
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Events</h2>

      <div className="flex gap-2">
        <Link
          href="/events?tab=upcoming"
          className={`rounded-md px-3 py-1.5 text-sm ${when === "upcoming" ? "bg-primary text-primary-foreground" : "border border-border text-foreground"}`}
        >
          Upcoming
        </Link>
        <Link
          href="/events?tab=past"
          className={`rounded-md px-3 py-1.5 text-sm ${when === "past" ? "bg-primary text-primary-foreground" : "border border-border text-foreground"}`}
        >
          Past
        </Link>
      </div>

      <Card className="py-0">
        <CardContent className="divide-y divide-border px-0">
          {events.length === 0 && (
            <p className="px-4 py-3 text-muted-foreground">No Events.</p>
          )}
          {events.map((e: Event) => (
            <Link
              key={e.id}
              href={`/events/${e.id}`}
              className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-muted"
            >
              <span className="flex flex-col">
                <span className="flex items-center gap-2 font-medium">
                  {e.title}
                  {e.cancelled && <Badge variant="destructive">Cancelled</Badge>}
                </span>
                <span className="text-sm text-muted-foreground">{formatWhen(e.start)}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
