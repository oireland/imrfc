import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { ChecklistEditor } from "@/components/checklist-editor";
import { ClashList } from "@/components/clash-list";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { CopySummary } from "@/components/copy-summary";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmedBadge, UnassignedBadge, YourDutyBadge } from "@/components/duty-badges";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { formatWhen } from "@/lib/format-time";
import { resolveEventChecklist } from "@/features/checklists";
import { listKitUnits } from "@/features/kit";
import {
  assignDuty,
  claimDuty,
  confirmDuty,
  markUnconfirmed,
  voidDutiesForEvent,
  ensureDuties,
  formatDutySummary,
  handOnDuty,
  listClashes,
  setDestination,
  unassignDuty,
  type Duty,
  type DutyDestination,
} from "@/features/duties";
import { cancelEvent, editOccurrence, getEvent, londonParts } from "@/features/events";
import { getLocation, listLocations, type Location } from "@/features/locations";
import { isCommitteeOrAbove, listApprovedUsers } from "@/features/users";
import { requireApprovedUser } from "@/lib/session";
import { ChevronRight } from "lucide-react";

export default async function EventDetailPage({ params }: PageProps<"/events/[id]">) {
  const { id } = await params;
  const user = await requireApprovedUser();

  const eventDetails = await getEvent(db, id);
  if (!eventDetails) notFound();

  const venue = await getLocation(db, eventDetails.venueId);

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
        venueId: String(formData.get("venueId")),
      },
      formData.get("scope") === "future" ? "future" : "this",
    );
    revalidatePath(`/events/${id}`);
    revalidatePath("/events");
  }

  async function duty(formData: FormData) {
    "use server";
    const current = await requireApprovedUser();
    const committee = isCommitteeOrAbove(current.role);
    const dutyId = String(formData.get("dutyId"));
    const other = String(formData.get("userId") ?? "");
    switch (formData.get("action")) {
      case "claim":
        await claimDuty(db, dutyId, current.id);
        break;
      case "handOn":
        if (other) await handOnDuty(db, dutyId, current.id, other);
        break;
      case "assign":
        if (committee && other) await assignDuty(db, dutyId, other);
        break;
      case "confirm":
        await confirmDuty(db, dutyId, current);
        await markUnconfirmed(db);
        break;
      case "unassign":
        if (committee) await unassignDuty(db, dutyId);
        break;
      case "destination": {
        if (!committee) break;
        const value = String(formData.get("destination"));
        const destination: DutyDestination =
          value === "holder" ? { type: "holder" } : value.startsWith("store:") ? { type: "store", storeId: value.slice(6) } : { type: "home" };
        await setDestination(db, dutyId, destination);
        break;
      }
    }
    revalidatePath(`/events/${id}`);
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
  const [duties, people, allLocations] = await Promise.all([
    ensureDuties(db, id, resolved.kitUnitIds),
    listApprovedUsers(db),
    listLocations(db),
  ]);
  const clashes = (await listClashes(db)).filter((c) => c.eventIds.includes(id));
  const approved = people.filter((p) => p.accessState === "approved");
  const personName = new Map(people.map((p) => [p.id, p.name]));
  const stores = allLocations.filter((l: Location) => l.isStore);
  const committee = isCommitteeOrAbove(user.role);
  const dutyFor = (kid: string, direction: Duty["direction"]) =>
    duties.find((d) => d.kitUnitId === kid && d.direction === direction)!;

  function DutyRow({ d }: { d: Duty }) {
    const mine = d.userId === user.id;
    const label = d.direction === "to" ? "To" : "From";
    return (
      <div className="flex flex-col gap-1.5 border-t border-border pt-2 first:border-t-0 first:pt-0">
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="font-medium">{label}:</span>
          {d.userId ? (
            <span>{mine ? "You" : (personName.get(d.userId) ?? d.userId)}</span>
          ) : (
            <UnassignedBadge />
          )}
          {mine && !d.voidedAt && <YourDutyBadge />}
          {d.voidedAt && <Badge variant="outline">Voided</Badge>}
          {d.confirmedAt && <ConfirmedBadge />}
        </div>
        {d.userId && !d.confirmedAt && !d.voidedAt && (mine || committee) && (
          <form action={duty}>
            <input type="hidden" name="dutyId" value={d.id} />
            <SubmitButton name="action" value="confirm" size="sm">
              Confirm
            </SubmitButton>
          </form>
        )}
        <form action={duty} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="dutyId" value={d.id} />
          {!d.userId && (
            <SubmitButton name="action" value="claim" size="sm">
              Claim
            </SubmitButton>
          )}
          {(mine || committee) && (
            <>
              <NativeSelect
                name="userId"
                aria-label={`${label} Duty person`}
                size="sm"
                defaultValue=""
              >
                <option value="" disabled>
                  Choose a person…
                </option>
                {approved.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </NativeSelect>
              {mine && (
                <SubmitButton name="action" value="handOn" variant="outline" size="sm">
                  Hand on
                </SubmitButton>
              )}
              {committee && (
                <SubmitButton name="action" value="assign" variant="outline" size="sm">
                  Assign
                </SubmitButton>
              )}
              {committee && d.userId && (
                <SubmitButton name="action" value="unassign" variant="outline" size="sm">
                  Unassign
                </SubmitButton>
              )}
            </>
          )}
        </form>
        {d.direction === "from" && (
          <form action={duty} className="flex flex-wrap items-center gap-2 text-sm">
            <input type="hidden" name="dutyId" value={d.id} />
            <input type="hidden" name="action" value="destination" />
            <span className="text-muted-foreground">Destination:</span>
            {committee ? (
              <>
                <NativeSelect
                  name="destination"
                  aria-label="Destination"
                  size="sm"
                  defaultValue={d.destination.type === "store" ? `store:${d.destination.storeId}` : d.destination.type}
                >
                  <option value="home">Home</option>
                  {stores.map((s: Location) => (
                    <option key={s.id} value={`store:${s.id}`}>{s.name}</option>
                  ))}
                  <option value="holder">Stays with the Duty&apos;s User</option>
                </NativeSelect>
                <SubmitButton size="sm">Set</SubmitButton>
              </>
            ) : (
              <span>
                {d.destination.type === "home"
                  ? "Home"
                  : d.destination.type === "holder"
                    ? "Stays with the Duty's User"
                    : (stores.find((s: Location) => s.id === (d.destination as { storeId: string }).storeId)?.name ?? "Store")}
              </span>
            )}
          </form>
        )}
      </div>
    );
  }
  const summary = formatDutySummary({
    title: eventDetails.title,
    start: eventDetails.start,
    venueName: venue?.name ?? "",
    items: resolved.kitUnitIds.map((kid) => ({
      kitName: kitNames.get(kid) ?? kid,
      to: dutyFor(kid, "to").userId ? (personName.get(dutyFor(kid, "to").userId!) ?? null) : null,
      from: dutyFor(kid, "from").userId ? (personName.get(dutyFor(kid, "from").userId!) ?? null) : null,
    })),
  });
  const sourceLabel = { event: "this Event", series: "its Series", default: "the Default Checklist", none: "" }[
    resolved.source
  ];

  const venues = eventDetails.seriesId ? (await listLocations(db)).filter((l: Location) => l.isVenue) : [];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            {eventDetails.title}
            {eventDetails.cancelled && <Badge variant="destructive">Cancelled</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p className="capitalize text-muted-foreground">{eventDetails.eventType}</p>
          <p>{formatWhen(eventDetails.start)} – {formatWhen(eventDetails.end)}</p>
          {venue && (
            <p>
              Venue:{" "}
              {venue.mapsLink ? (
                <a href={venue.mapsLink} target="_blank" rel="noreferrer" className="underline">
                  {venue.name}
                </a>
              ) : (
                venue.name
              )}
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
                triggerLabel="Cancel Event"
                title="Cancel Event?"
                description="This voids all its Duties. The Event stays visible, marked as cancelled."
                confirmLabel="Cancel Event"
              />
            </form>
          )}
        </CardContent>
      </Card>

      <ClashList clashes={clashes} />

      <Card className="py-0">
        <CardHeader className="pt-4">
          <CardTitle>Duties</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border pb-4">
          {resolved.kitUnitIds.map((kid) => (
            <div key={kid} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <span className="font-medium">{kitNames.get(kid) ?? kid}</span>
              <DutyRow d={dutyFor(kid, "to")} />
              <DutyRow d={dutyFor(kid, "from")} />
            </div>
          ))}
          {resolved.kitUnitIds.length === 0 && (
            <p className="py-3 text-muted-foreground">No Duties yet.</p>
          )}
        </CardContent>
      </Card>

      <CopySummary text={summary} />

      {committee && (
        <Card>
          <CardHeader>
            <CardTitle>Checklist{sourceLabel && ` (from ${sourceLabel})`}</CardTitle>
          </CardHeader>
          <CardContent>
            <ChecklistEditor
              target={{ scope: "event", scopeId: id }}
              path={`/events/${id}`}
              inheritedFrom={sourceLabel ? `Checklist from ${sourceLabel}` : undefined}
            />
          </CardContent>
        </Card>
      )}

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
                  <NativeSelect id={`edit-venue-${id}`} name="venueId" defaultValue={eventDetails.venueId}>
                    {venues.map((v: Location) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`edit-scope-${id}`}>Applies to</Label>
                  <NativeSelect id={`edit-scope-${id}`} name="scope" defaultValue="this">
                    <option value="this">This one</option>
                    <option value="future">This and future</option>
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
