import Link from "next/link";
import { ChevronRight, Upload } from "lucide-react";
import { db } from "@/db/client";
import { AddEventButton } from "@/components/add-event-button";
import { BackLink } from "@/components/back-link";
import { ComingUp } from "@/components/coming-up";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatWhen } from "@/lib/time/format-time";
import { listEvents, type Event } from "@/features/events";
import { isCommitteeOrAbove } from "@/features/users";
import { requireApprovedUser } from "@/lib/auth/session";
import { quickAddEvent, saveMyReply } from "../actions";
import { loadComingUp } from "../coming-up-data";

export default async function EventsPage({ searchParams }: PageProps<"/events">) {
  const user = await requireApprovedUser();
  const { tab } = await searchParams;
  const committee = isCommitteeOrAbove(user.role);

  if (tab === "past") {
    const past = await listEvents(db, { when: "past" });
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <BackLink href="/events">Events</BackLink>
          <h2 className="font-heading text-[40px] leading-none tracking-tight">Past events</h2>
        </div>
        <Card className="py-0">
          <CardContent className="divide-y divide-border px-0">
            {past.length === 0 && <p className="px-5 py-4 text-muted-foreground">No past events yet.</p>}
            {past.map((e: Event) => (
              <Link key={e.id} href={`/events/${e.id}`} className="flex items-center justify-between gap-2 px-5 py-3.5 hover:bg-muted/60">
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2 truncate font-medium">
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

  const comingUp = await loadComingUp(user.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3">
        <h2 className="font-heading text-[40px] leading-none tracking-tight">Events</h2>
        <Link href="/events?tab=past" className="flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
          Past events <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <ComingUp {...comingUp} title="Upcoming" canAdd={committee} addAction={quickAddEvent} reply={saveMyReply} />

      {committee && (
        <div className="flex flex-col gap-2">
          <AddEventButton venues={comingUp.venues} teams={comingUp.teams} action={quickAddEvent} />
          <Link href="/events/import" className={buttonVariants({ variant: "outline", size: "lg", className: "h-11 w-full" })}>
            <Upload aria-hidden="true" />
            Import from CSV
          </Link>
        </div>
      )}
    </div>
  );
}
