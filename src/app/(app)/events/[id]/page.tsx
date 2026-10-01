import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { ClashList } from "@/components/clash-list";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { CopySummary } from "@/components/copy-summary";
import { EditEventButton } from "@/components/edit-event-button";
import type { KitEditing } from "@/components/kit-editing";
import { EventDuties, type DutyEquipment, type DutySlot, type HolderOption, type SourceOption } from "@/components/event-duties";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { AvailabilitySlot } from "@/components/availability-slot";
import { TeamCard } from "@/components/team-card";
import { ShareButton } from "@/components/share-button";
import { formatWhen } from "@/lib/format-time";
import { mapsSearchUrl } from "@/lib/maps";
import {
  addToChecklist,
  clearChecklist,
  getChecklist,
  getInheritedChecklist,
  removeFromChecklist,
  resolveEventChecklist,
  setChecklistItemCount,
  type ChecklistScope,
} from "@/features/checklists";
import { describeWhereabouts, listEquipmentUnits, listPortionsFor, type EquipmentUnit, type Portion } from "@/features/equipment";
import {
  actOnDuty,
  dropDutiesFor,
  dutyActions,
  voidDutiesForEvent,
  ensureDuties,
  formatDutySummary,
  gatherConfirmSources,
  joinNames,
  listPeopleOnEquipment,
  listPlanWarnings,
  needsSourceChoice,
  type Duty,
  type DutyRequest,
} from "@/features/duties";
import {
  buildQuickEvent,
  cancelEvent,
  editEvent,
  editOccurrence,
  getEvent,
  listEventTitles,
  listTeams,
  listVenues,
  londonParts,
  type QuickEventInput,
} from "@/features/events";
import { getTeamCard } from "@/features/selection";
import { listStores, type Store } from "@/features/stores";
import { displayName, isCommitteeOrAbove, listApprovedUsers } from "@/features/users";
import { requireApprovedUser } from "@/lib/session";

/** Why the signed-in User can't change this Event's list, or null if they can: Committee only, and not once it's Cancelled. */
async function refuseListChange(eventId: string): Promise<{ ok: false; error: string } | null> {
  const current = await requireApprovedUser();
  if (!isCommitteeOrAbove(current.role)) return { ok: false, error: "Only Committee can change the list." };
  if ((await getEvent(db, eventId))?.cancelled) return { ok: false, error: "This event is cancelled." };
  return null;
}

/** Equipment on the Event's own list that the list it would fall back to doesn't have. */
async function unitsOnlyOnOwnList(target: ChecklistScope): Promise<string[]> {
  const [own, inherited] = await Promise.all([getChecklist(db, target), getInheritedChecklist(db, target)]);
  const kept = new Set(inherited.map((l) => l.equipmentUnitId));
  return (own ?? []).map((l) => l.equipmentUnitId).filter((unitId) => !kept.has(unitId));
}

export default async function EventDetailPage({ params }: PageProps<"/events/[id]">) {
  const { id } = await params;
  const user = await requireApprovedUser();

  const committee = isCommitteeOrAbove(user.role);
  // Everything that doesn't depend on the Event itself starts at once.
  const [eventDetails, equipmentUnits, people, stores, warnings, venues, allTeams, teamCard] = await Promise.all([
    getEvent(db, id),
    listEquipmentUnits(db),
    listApprovedUsers(db),
    listStores(db),
    listPlanWarnings(db),
    committee ? listVenues(db) : [],
    committee ? listTeams(db) : [],
    getTeamCard(db, id, { id: user.id, committee }),
  ]);
  if (!eventDetails) notFound();
  const seriesId = eventDetails.seriesId;

  async function cancel() {
    "use server";
    const current = await requireApprovedUser();
    if (!isCommitteeOrAbove(current.role)) return;
    await cancelEvent(db, id);
    await voidDutiesForEvent(db, id);
    revalidatePath(`/events/${id}`);
  }

  async function edit(input: QuickEventInput & { scope: "this" | "future" }): Promise<{ ok: true } | { ok: false; error: string }> {
    "use server";
    const current = await requireApprovedUser();
    if (!isCommitteeOrAbove(current.role)) return { ok: false, error: "Only Committee can edit Events." };

    const result = seriesId
      ? await editOccurrence(
          db,
          id,
          { title: input.title, startTime: input.startTime, endTime: input.endTime, venue: input.venue, notes: input.notes },
          input.scope,
        )
      : await editEvent(db, id, buildQuickEvent(input));
    if (!result.ok) return result;

    revalidatePath(`/events/${id}`);
    revalidatePath("/events");
    revalidatePath("/");
    return { ok: true };
  }

  async function act(dutyId: string, request: DutyRequest) {
    "use server";
    const current = await requireApprovedUser();
    const result = await actOnDuty(db, dutyId, current, request);
    revalidatePath(`/events/${id}`);
    return result;
  }

  // Changing the list starts from whatever list the Event inherits, so nothing already on it is lost.
  const listTarget: ChecklistScope = {
    scope: "event",
    scopeId: id,
    inherits: { seriesId: eventDetails.seriesId, eventType: eventDetails.eventType },
  };
  async function addKit(equipmentUnitId: string, count: number | null) {
    "use server";
    const denied = await refuseListChange(id);
    if (denied) return denied;
    const result = await addToChecklist(db, listTarget, equipmentUnitId, count);
    revalidatePath(`/events/${id}`);
    return result;
  }
  async function removeKit(equipmentUnitId: string) {
    "use server";
    const denied = await refuseListChange(id);
    if (denied) return denied;
    await removeFromChecklist(db, listTarget, equipmentUnitId);
    await dropDutiesFor(db, id, [equipmentUnitId]);
    revalidatePath(`/events/${id}`);
    return { ok: true as const };
  }
  async function setKitCount(equipmentUnitId: string, count: number | null) {
    "use server";
    const denied = await refuseListChange(id);
    if (denied) return denied;
    const result = await setChecklistItemCount(db, listTarget, equipmentUnitId, count);
    revalidatePath(`/events/${id}`);
    return result;
  }
  async function resetKit() {
    "use server";
    const denied = await refuseListChange(id);
    if (denied) return denied;
    const dropped = await unitsOnlyOnOwnList(listTarget);
    await clearChecklist(db, listTarget);
    await dropDutiesFor(db, id, dropped);
    revalidatePath(`/events/${id}`);
    return { ok: true as const };
  }

  const resolved = await resolveEventChecklist(db, {
    eventId: id,
    seriesId: eventDetails.seriesId,
    eventType: eventDetails.eventType,
  });
  const equipmentNames = new Map(equipmentUnits.map((u) => [u.id, u.name]));
  const equipmentUnitIds = resolved.items.map((i) => i.equipmentUnitId);
  const countByUnit = new Map(resolved.items.map((i) => [i.equipmentUnitId, i.count]));
  const canEditList = committee && !eventDetails.cancelled;
  const [duties, portions, peopleOnEquipment, onlyOnOwnList] = await Promise.all([
    ensureDuties(db, id, equipmentUnitIds),
    listPortionsFor(db, equipmentUnitIds),
    canEditList ? listPeopleOnEquipment(db, id, equipmentUnitIds) : new Map<string, Set<string>>(),
    canEditList && resolved.source === "event" ? unitsOnlyOnOwnList(listTarget) : [],
  ]);
  const clashes = warnings.clashes.filter((c) => c.eventIds.includes(id));
  const headsUps = warnings.headsUps.filter((h) => h.eventIds.includes(id));
  const approved = people.filter((p) => p.accessState === "approved");
  const personName = new Map(people.map((p) => [p.id, displayName(p)]));
  const dutyFor = (kid: string, direction: Duty["direction"]) =>
    duties.find((d) => d.equipmentUnitId === kid && d.direction === direction)!;

  const equipmentById = new Map(equipmentUnits.map((u: EquipmentUnit) => [u.id, u]));
  const portionsByUnit = new Map<string, Portion[]>();
  for (const p of portions) portionsByUnit.set(p.equipmentUnitId, [...(portionsByUnit.get(p.equipmentUnitId) ?? []), p]);
  const eventNames = await listEventTitles(db, portions.flatMap((p) => (p.lastSeenEventId ? [p.lastSeenEventId] : [])));
  const storeName = (storeId: string | null) => stores.find((s: Store) => s.id === storeId)?.name ?? "a store";
  const nameOf = (userId: string | null) => (userId === user.id ? "You" : userId ? (personName.get(userId) ?? "Someone") : null);
  const whereaboutsNow = (equipmentUnitId: string) =>
    describeWhereabouts(portionsByUnit.get(equipmentUnitId) ?? [], {
      storeName: (sid) => storeName(sid),
      personName: (holderId) => (holderId === user.id ? "you" : (nameOf(holderId) ?? "someone")),
      eventName: (eventId) => eventNames.get(eventId) ?? "an event",
    });
  const namesOf = (userIds: string[]) => joinNames(userIds.map((uid) => (uid === user.id ? "You" : (nameOf(uid) ?? "Someone"))));
  /** Names for a confirmation sentence, so the viewer is "you". */
  const affectedNames = (userIds: Iterable<string> | undefined) =>
    [...(userIds ?? [])].map((uid) => (uid === user.id ? "you" : (personName.get(uid) ?? "someone")));
  const dutyEquipment: DutyEquipment[] = equipmentUnitIds.map((kid) => {
    const unit = equipmentById.get(kid);
    const homeId = unit?.homeId ?? null;
    const count = countByUnit.get(kid) ?? 1;
    const equipmentPortions = portionsByUnit.get(kid) ?? [];
    const toDuty = dutyFor(kid, "to");
    const fromDuty = dutyFor(kid, "from");

    const slot = (d: Duty): DutySlot => {
      const needsSource = d.direction === "to" && needsSourceChoice(equipmentPortions, { dutyUserIds: d.userIds, count });
      const sourceOptions: SourceOption[] = needsSource
        ? gatherConfirmSources(equipmentPortions, { dutyUserIds: d.userIds, homeStoreId: homeId ?? "", count }).sources.map((s) => ({
            value:
              s.place.type === "store"
                ? `store:${s.place.storeId}`
                : s.place.type === "holder"
                  ? `holder:${s.place.holderId}`
                  : `store:${homeId}`,
            label:
              s.place.type === "store"
                ? storeName(s.place.storeId)
                : s.place.type === "holder"
                  ? (nameOf(s.place.holderId) ?? "Someone")
                  : "Not confirmed",
            count: s.count,
          }))
        : [];
      const needsHolder = d.userIds.length > 1 && count > 1 && (d.direction === "to" || d.destination.type === "holder");
      const holderOptions: HolderOption[] = needsHolder
        ? d.userIds.map((uid) => ({ userId: uid, name: uid === user.id ? "You" : (nameOf(uid) ?? "Someone"), count: uid === user.id ? count : 0 }))
        : [];
      if (needsHolder && !holderOptions.some((h) => h.count > 0)) holderOptions[0].count = count;
      return {
        id: d.id,
        direction: d.direction,
        userIds: d.userIds,
        people: d.userIds.map((uid) => (uid === user.id ? "You" : (nameOf(uid) ?? "Someone"))),
        mine: d.userIds.includes(user.id),
        confirmed: !!d.confirmedAt,
        voided: !!d.voidedAt,
        actions: dutyActions(
          { direction: d.direction, userIds: d.userIds, confirmed: !!d.confirmedAt, voided: !!d.voidedAt },
          { viewerId: user.id, committee },
        ),
        destination:
          d.destination.type === "store" && d.destination.storeId !== homeId ? `store:${d.destination.storeId}` : d.destination.type === "holder" ? "holder" : "home",
        needsSourceChoice: needsSource,
        sourceOptions,
        needsHolderChoice: needsHolder,
        holderOptions,
      };
    };

    return {
      equipmentUnitId: kid,
      equipmentName: equipmentNames.get(kid) ?? "Equipment",
      count,
      quantity: unit?.quantity ?? 1,
      now: !unit ? "" : whereaboutsNow(kid),
      goesBackTo:
        fromDuty.destination.type === "store"
          ? storeName(fromDuty.destination.storeId)
          : fromDuty.destination.type === "holder"
            ? `stays with ${namesOf(fromDuty.userIds) || "whoever takes it back"}`
            : storeName(homeId),
      places: [
        { value: "home", label: `${storeName(homeId)} (its home)` },
        ...stores.filter((s: Store) => s.id !== homeId).map((s: Store) => ({ value: `store:${s.id}`, label: s.name })),
        { value: "holder", label: "Stays with whoever takes it back" },
      ],
      affected: affectedNames(peopleOnEquipment.get(kid)),
      to: slot(toDuty),
      from: slot(fromDuty),
      headsUps: headsUps.filter((h) => h.equipmentUnitId === kid).map((h) => h.message),
    };
  });
  const summary = formatDutySummary({
    title: eventDetails.title,
    start: eventDetails.start,
    venueName: eventDetails.venue,
    items: equipmentUnitIds.map((kid) => ({
      equipmentName: equipmentNames.get(kid) ?? kid,
      count: countByUnit.get(kid) ?? 1,
      quantity: equipmentById.get(kid)?.quantity ?? 1,
      to: dutyFor(kid, "to").userIds.length > 0 ? joinNames(dutyFor(kid, "to").userIds.map((uid) => personName.get(uid) ?? "Someone")) : null,
      from: dutyFor(kid, "from").userIds.length > 0 ? joinNames(dutyFor(kid, "from").userIds.map((uid) => personName.get(uid) ?? "Someone")) : null,
    })),
  });
  const kit: KitEditing | undefined = canEditList
    ? {
        options: equipmentUnits
          .filter((u: EquipmentUnit) => u.status === "active" && !equipmentUnitIds.includes(u.id))
          .map((u: EquipmentUnit) => ({ id: u.id, name: u.name, subtitle: storeName(u.homeId), quantity: u.quantity })),
        add: addKit,
        remove: removeKit,
        setCount: setKitCount,
        reset:
          resolved.source === "event"
            ? {
                label: eventDetails.seriesId ? "the series list" : "the default list",
                affected: affectedNames(
                  new Set(onlyOnOwnList.flatMap((unitId) => [...(peopleOnEquipment.get(unitId) ?? [])])),
                ),
                run: resetKit,
              }
            : undefined,
      }
    : undefined;
  const checklistSource = {
    event: "This event's own list",
    series: "From its series",
    default: `The default for ${eventDetails.eventType}`,
    none: "",
  }[resolved.source];

  const editInitial = {
    date: londonParts(eventDetails.start).date,
    startTime: londonParts(eventDetails.start).time,
    endTime: londonParts(eventDetails.end).time,
    title: eventDetails.title,
    venue: eventDetails.venue,
    notes: eventDetails.notes,
    teamIds: eventDetails.teams.map((t) => t.id),
    ...(eventDetails.matchDetails && {
      opponent: eventDetails.matchDetails.opponent,
      homeAway: eventDetails.matchDetails.homeAway,
      competition: eventDetails.matchDetails.competition,
      meetTime: londonParts(eventDetails.matchDetails.meetTime).time,
      travelMeetTime: eventDetails.matchDetails.travelMeetTime ? londonParts(eventDetails.matchDetails.travelMeetTime).time : undefined,
      travelMeetPoint: eventDetails.matchDetails.travelMeetPoint ?? undefined,
    }),
  };

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/events">Events</BackLink>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 text-[28px] leading-none">
            <span className="flex items-center gap-2">
              {eventDetails.title}
              {eventDetails.cancelled && <Badge variant="destructive">Cancelled</Badge>}
            </span>
            {committee && !eventDetails.cancelled && (
              <EditEventButton
                eventType={eventDetails.eventType}
                isOccurrence={!!eventDetails.seriesId}
                venues={venues}
                teams={allTeams}
                initial={editInitial}
                action={edit}
              />
            )}
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

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <ShareButton title={eventDetails.title} />
            {committee && eventDetails.eventType === "match" && (
              <Link href={`/events/${id}/selection`} className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                Pick the team
              </Link>
            )}

            {!eventDetails.cancelled && committee && (
              <form id={`cancel-event-${id}`} action={cancel}>
                <ConfirmSubmit
                  formId={`cancel-event-${id}`}
                  triggerLabel="Cancel event"
                  title="Cancel this event?"
                  description="Nobody will need to bring equipment to it. It stays in the calendar, marked as cancelled."
                  confirmLabel="Cancel event"
                />
              </form>
            )}
          </div>
        </CardContent>
      </Card>

      {teamCard && <TeamCard card={teamCard} />}
      <AvailabilitySlot eventId={id} viewer={user} />
      <ClashList clashes={clashes} />
      <EventDuties
        equipment={dutyEquipment}
        eventTitle={eventDetails.title}
        soon={headsUps.some((h) => h.kind === "unfilled_duty")}
        viewerId={user.id}
        people={approved.map((p) => ({ id: p.id, name: displayName(p) }))}
        act={act}
        kit={kit}
        listSource={checklistSource}
      />

      <CopySummary text={summary} />
    </div>
  );
}
