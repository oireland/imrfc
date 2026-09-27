import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ChevronRight } from "lucide-react";
import { db } from "@/db/client";
import { ChecklistEditor } from "@/components/checklist-editor";
import { ClashList } from "@/components/clash-list";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { CopySummary } from "@/components/copy-summary";
import { EventDuties, type DutyKit, type DutySlot } from "@/components/event-duties";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { BackLink } from "@/components/back-link";
import { formatWhen } from "@/lib/format-time";
import { mapsSearchUrl } from "@/lib/maps";
import { VenueInput } from "@/components/venue-input";
import { resolveEventChecklist } from "@/features/checklists";
import { describeWhereabouts, listKitUnits, listPortionsFor, type KitUnit, type Portion } from "@/features/kit";
import {
  actOnDuty,
  dutyActions,
  voidDutiesForEvent,
  ensureDuties,
  formatDutySummary,
  listClashes,
  listHeadsUps,
  type Duty,
  type DutyRequest,
} from "@/features/duties";
import { cancelEvent, editOccurrence, getEvent, listVenues, londonParts } from "@/features/events";
import { listStores, type Store } from "@/features/stores";
import { displayName, isCommitteeOrAbove, listApprovedUsers } from "@/features/users";
import { requireApprovedUser } from "@/lib/session";

export default async function EventDetailPage({ params }: PageProps<"/events/[id]">) {
  const { id } = await params;
  const user = await requireApprovedUser();

  const eventDetails = await getEvent(db, id);
  if (!eventDetails) notFound();

  async function cancel() {
    "use server";
    const current = await requireApprovedUser();
    if (!isCommitteeOrAbove(current.role)) return;
    await cancelEvent(db, id);
    await voidDutiesForEvent(db, id);
    revalidatePath(`/events/${id}`);
  }

  async function edit(formData: FormData) {
    "use server";
    const current = await requireApprovedUser();
    if (!isCommitteeOrAbove(current.role)) return;
    await editOccurrence(
      db,
      id,
      {
        title: String(formData.get("title")),
        startTime: String(formData.get("startTime")),
        endTime: String(formData.get("endTime")),
        venue: String(formData.get("venue")),
      },
      formData.get("scope") === "future" ? "future" : "this",
    );
    revalidatePath(`/events/${id}`);
    revalidatePath("/events");
  }

  async function act(dutyId: string, request: DutyRequest) {
    "use server";
    const current = await requireApprovedUser();
    const result = await actOnDuty(db, dutyId, current, request);
    revalidatePath(`/events/${id}`);
    return result;
  }

  const [resolved, kitUnits] = await Promise.all([
    resolveEventChecklist(db, {
      eventId: id,
      seriesId: eventDetails.seriesId,
      eventType: eventDetails.eventType,
    }),
    listKitUnits(db),
  ]);
  const kitNames = new Map(kitUnits.map((u) => [u.id, u.name]));
  const kitUnitIds = resolved.items.map((i) => i.kitUnitId);
  const countByUnit = new Map(resolved.items.map((i) => [i.kitUnitId, i.count]));
  const [duties, people, stores] = await Promise.all([
    ensureDuties(db, id, kitUnitIds),
    listApprovedUsers(db),
    listStores(db),
  ]);
  const [clashes, headsUps] = await Promise.all([
    listClashes(db).then((all) => all.filter((c) => c.eventIds.includes(id))),
    listHeadsUps(db).then((all) => all.filter((h) => h.eventIds.includes(id))),
  ]);
  const approved = people.filter((p) => p.accessState === "approved");
  const personName = new Map(people.map((p) => [p.id, displayName(p)]));
  const committee = isCommitteeOrAbove(user.role);
  const dutyFor = (kid: string, direction: Duty["direction"]) =>
    duties.find((d) => d.kitUnitId === kid && d.direction === direction)!;

  const kitById = new Map(kitUnits.map((u: KitUnit) => [u.id, u]));
  const portions = await listPortionsFor(db, kitUnitIds);
  const portionsByUnit = new Map<string, Portion[]>();
  for (const p of portions) portionsByUnit.set(p.kitUnitId, [...(portionsByUnit.get(p.kitUnitId) ?? []), p]);
  const eventTitleFor = async (eventId: string) => (await getEvent(db, eventId))?.title ?? "an event";
  const eventNames = new Map<string, string>();
  for (const eventId of new Set(portions.flatMap((p) => (p.lastSeenEventId ? [p.lastSeenEventId] : [])))) {
    eventNames.set(eventId, await eventTitleFor(eventId));
  }
  const storeName = (storeId: string | null) => stores.find((s: Store) => s.id === storeId)?.name ?? "a store";
  const nameOf = (userId: string | null) => (userId === user.id ? "You" : userId ? (personName.get(userId) ?? "Someone") : null);
  const whereaboutsNow = (kitUnitId: string) =>
    describeWhereabouts(portionsByUnit.get(kitUnitId) ?? [], {
      storeName: (sid) => storeName(sid),
      personName: (holderId) => (holderId === user.id ? "you" : (nameOf(holderId) ?? "someone")),
      eventName: (eventId) => eventNames.get(eventId) ?? "an event",
    });
  const slot = (d: Duty, homeId: string | null): DutySlot => ({
    id: d.id,
    direction: d.direction,
    userId: d.userId,
    person: nameOf(d.userId),
    mine: d.userId === user.id,
    confirmed: !!d.confirmedAt,
    voided: !!d.voidedAt,
    actions: dutyActions(
      { direction: d.direction, userId: d.userId, confirmed: !!d.confirmedAt, voided: !!d.voidedAt },
      { viewerId: user.id, committee },
    ),
    destination:
      d.destination.type === "store" && d.destination.storeId !== homeId ? `store:${d.destination.storeId}` : d.destination.type === "holder" ? "holder" : "home",
  });
  const dutyKit: DutyKit[] = kitUnitIds.map((kid) => {
    const unit = kitById.get(kid);
    const homeId = unit?.homeId ?? null;
    const from = dutyFor(kid, "from");
    return {
      kitUnitId: kid,
      kitName: kitNames.get(kid) ?? "Kit",
      count: countByUnit.get(kid) ?? 1,
      quantity: unit?.quantity ?? 1,
      now: !unit ? "" : whereaboutsNow(kid),
      goesBackTo:
        from.destination.type === "store"
          ? storeName(from.destination.storeId)
          : from.destination.type === "holder"
            ? `stays with ${from.userId === user.id ? "you" : (nameOf(from.userId) ?? "whoever takes it back")}`
            : storeName(homeId),
      places: [
        { value: "home", label: `${storeName(homeId)} (its home)` },
        ...stores.filter((s: Store) => s.id !== homeId).map((s: Store) => ({ value: `store:${s.id}`, label: s.name })),
        { value: "holder", label: "Stays with whoever takes it back" },
      ],
      to: slot(dutyFor(kid, "to"), homeId),
      from: slot(from, homeId),
      headsUps: headsUps.filter((h) => h.kitUnitId === kid).map((h) => h.message),
    };
  });
  const summary = formatDutySummary({
    title: eventDetails.title,
    start: eventDetails.start,
    venueName: eventDetails.venue,
    items: kitUnitIds.map((kid) => ({
      kitName: kitNames.get(kid) ?? kid,
      count: countByUnit.get(kid) ?? 1,
      quantity: kitById.get(kid)?.quantity ?? 1,
      to: dutyFor(kid, "to").userId ? (personName.get(dutyFor(kid, "to").userId!) ?? null) : null,
      from: dutyFor(kid, "from").userId ? (personName.get(dutyFor(kid, "from").userId!) ?? null) : null,
    })),
  });
  const checklistSource = {
    event: "This event's own list",
    series: "From its series",
    default: `The default for ${eventDetails.eventType}`,
    none: "",
  }[resolved.source];

  const venues = eventDetails.seriesId ? await listVenues(db) : [];

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/events">Events</BackLink>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[28px] leading-none">
            {eventDetails.title}
            {eventDetails.cancelled && <Badge variant="destructive">Cancelled</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p className="capitalize text-muted-foreground">{eventDetails.eventType}</p>
          <p>{formatWhen(eventDetails.start)} – {formatWhen(eventDetails.end)}</p>
          {eventDetails.venue && (
            <p>
              Venue:{" "}
              <a href={mapsSearchUrl(eventDetails.venue)} target="_blank" rel="noreferrer" className="underline">
                {eventDetails.venue}
              </a>
            </p>
          )}
          {eventDetails.teams.length > 0 && (
            <p>Teams: {eventDetails.teams.map((t) => t.name).join(", ")}</p>
          )}
          {eventDetails.notes && <p>Notes: {eventDetails.notes}</p>}

          {eventDetails.matchDetails && (
            <div className="mt-2 flex flex-col gap-1 rounded-md border border-border p-3">
              <p className="font-medium">Match details</p>
              <p>Opponent: {eventDetails.matchDetails.opponent}</p>
              <p>{eventDetails.matchDetails.homeAway === "home" ? "Home" : "Away"}</p>
              <p className="uppercase">{eventDetails.matchDetails.competition}</p>
              <p>Kick-off: {formatWhen(eventDetails.start)}</p>
              <p>Meet time: {formatWhen(eventDetails.matchDetails.meetTime)}</p>
              {eventDetails.matchDetails.travelMeetTime && (
                <p>
                  Travel meet: {formatWhen(eventDetails.matchDetails.travelMeetTime)}
                  {eventDetails.matchDetails.travelMeetPoint &&
                    ` at ${eventDetails.matchDetails.travelMeetPoint}`}
                </p>
              )}
            </div>
          )}

          {!eventDetails.cancelled && committee && (
            <form id={`cancel-event-${id}`} action={cancel} className="mt-3 self-start">
              <ConfirmSubmit
                formId={`cancel-event-${id}`}
                triggerLabel="Cancel event"
                title="Cancel this event?"
                description="Nobody will need to bring kit to it. It stays in the calendar, marked as cancelled."
                confirmLabel="Cancel event"
              />
            </form>
          )}
        </CardContent>
      </Card>

      <ClashList clashes={clashes} />
      <EventDuties
        kit={dutyKit}
        eventTitle={eventDetails.title}
        soon={headsUps.some((h) => h.kind === "unfilled_duty")}
        viewerId={user.id}
        people={approved.map((p) => ({ id: p.id, name: displayName(p) }))}
        act={act}
      />

      {committee && (
        <Card>
          <CardHeader>
            <CardTitle>Kit needed</CardTitle>
            {checklistSource && <p className="text-sm text-muted-foreground">{checklistSource}</p>}
          </CardHeader>
          <CardContent>
            <ChecklistEditor
              target={{ scope: "event", scopeId: id }}
              path={`/events/${id}`}
              inheritedFrom={eventDetails.seriesId ? "the series list" : "the default list"}
            />
          </CardContent>
        </Card>
      )}

      <CopySummary text={summary} />

      {eventDetails.seriesId && !eventDetails.cancelled && committee && (
        <Collapsible>
          <Card className="py-0">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left font-medium group">
              Edit event
              <ChevronRight className="size-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" aria-hidden="true" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <form action={edit} className="flex flex-col gap-3 border-t border-border p-4 text-sm">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`edit-title-${id}`}>Title</Label>
                  <Input id={`edit-title-${id}`} name="title" defaultValue={eventDetails.title} required />
                </div>
                <div className="flex gap-2">
                  <div className="flex flex-1 flex-col gap-1">
                    <Label htmlFor={`edit-start-${id}`}>Start time</Label>
                    <Input
                      id={`edit-start-${id}`}
                      type="time"
                      name="startTime"
                      defaultValue={londonParts(eventDetails.start).time}
                      required
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <Label htmlFor={`edit-end-${id}`}>End time</Label>
                    <Input
                      id={`edit-end-${id}`}
                      type="time"
                      name="endTime"
                      defaultValue={londonParts(eventDetails.end).time}
                      required
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`edit-venue-${id}`}>Venue</Label>
                  <VenueInput id={`edit-venue-${id}`} name="venue" defaultValue={eventDetails.venue} suggestions={venues} required />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`edit-scope-${id}`}>Applies to</Label>
                  <NativeSelect id={`edit-scope-${id}`} name="scope" defaultValue="this">
                    <NativeSelectOption value="this">This one</NativeSelectOption>
                    <NativeSelectOption value="future">This and future</NativeSelectOption>
                  </NativeSelect>
                </div>
                <SubmitButton className="self-start">Save</SubmitButton>
              </form>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
    </div>
  );
}
