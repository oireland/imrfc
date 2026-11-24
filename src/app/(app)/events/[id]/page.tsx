import { teamsForRequest } from "../../request-cache";
import { notFound, redirect } from "next/navigation";
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
import { EventTabs, type EventTab } from "@/components/event-tabs";
import { ShareButton } from "@/components/share-button";
import { buttonVariants } from "@/components/ui/button";
import { formatDay, formatWhen } from "@/lib/time/format-time";
import { joinList } from "@/lib/text/join-names";
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
import { describeWhereabouts, hasEquipmentUnconfirmedAt, listEquipmentUnits, listPortionsFor, placeKey, type EquipmentUnit } from "@/features/equipment";
import {
  actOnEventDuty,
  countToMove,
  deleteDuties,
  dutyActions,
  voidDutiesForEvent,
  gatherConfirmSources,
  listEventDuties,
  listPeopleOnEquipment,
  listPlanWarnings,
  handedOnSources,
  holdersFromShares,
  pendingShares,
  needsSourceChoice,
  unclaimed,
  type EventDuty,
  type DutyRequest,
} from "@/features/duties";
import {
  buildQuickEvent,
  cancelEvent,
  deleteEvent,
  editEvent,
  editOccurrence,
  getEvent,
  listEventTitles,
  listVenues,
  type QuickEventInput,
} from "@/features/events";
import { deleteAvailabilityForEvent, takesReplies } from "@/features/availability";
import { deleteSelectionForEvent, getTeamCard, listPickedPlayerIds } from "@/features/selection";
import { formatPhysioList, listPhysioNeeds } from "@/features/injuries";
import { listStores, type Store } from "@/features/stores";
import { canDeleteEvent, displayName, isCommitteeOrAbove, listKnownUsers } from "@/features/users";
import { requireApprovedUser } from "@/lib/auth/session";
import { londonParts } from "@/lib/time/london";
import type { Result, Failure } from "@/lib/result";

/** Why the signed-in User can't change this Event's list, or null if they can: Committee only, and not once it's Cancelled. */
async function refuseListChange(eventId: string): Promise<Failure | null> {
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
    listKnownUsers(db),
    listStores(db),
    listPlanWarnings(db, new Date(), { eventId: id }),
    committee ? listVenues(db) : [],
    committee ? teamsForRequest() : [],
    getTeamCard(db, id, { id: user.id, committee }),
  ]);
  if (!eventDetails) notFound();
  const seriesId = eventDetails.seriesId;

  // For the physio: only the Players picked for a Match, and only Committee see Injuries.
  const pickedIds = committee && eventDetails.eventType === "match" ? await listPickedPlayerIds(db, id) : [];
  const physioList =
    pickedIds.length > 0
      ? formatPhysioList(`${eventDetails.title}, ${formatDay(eventDetails.start)}`, await listPhysioNeeds(db, pickedIds))
      : null;

  async function cancel() {
    "use server";
    const current = await requireApprovedUser();
    if (!isCommitteeOrAbove(current.role)) return;
    await db.transaction(async (tx) => {
      await cancelEvent(tx, id);
      await voidDutiesForEvent(tx, id);
    });
    revalidatePath(`/events/${id}`);
  }

  async function remove() {
    "use server";
    const current = await requireApprovedUser();
    if (!canDeleteEvent(current.role)) return;
    if (await hasEquipmentUnconfirmedAt(db, id)) redirect(`/events/${id}?error=event-has-unconfirmed`);
    await db.transaction(async (tx) => {
      await deleteDuties(tx, id);
      await deleteSelectionForEvent(tx, id);
      await deleteAvailabilityForEvent(tx, id);
      await clearChecklist(tx, { scope: "event", scopeId: id });
      await deleteEvent(tx, id);
    });
    revalidatePath("/events");
    redirect("/events");
  }

  // An Event's type is fixed: edits use the stored one, never what the client sends.
  const storedType = eventDetails.eventType;
  async function edit(input: QuickEventInput & { scope: "this" | "future" }): Promise<Result> {
    "use server";
    const current = await requireApprovedUser();
    if (!isCommitteeOrAbove(current.role)) return { ok: false, error: "Only Committee can edit Events." };

    const result = seriesId
      ? await editOccurrence(
          db,
          id,
          { title: input.title, startTime: input.startTime, endTime: input.endTime ?? input.startTime, venue: input.venue, notes: input.notes },
          input.scope,
        )
      : await editEvent(db, id, buildQuickEvent({ ...input, type: storedType }));
    if (!result.ok) return result;

    revalidatePath(`/events/${id}`);
    revalidatePath("/events");
    revalidatePath("/");
    return { ok: true };
  }

  async function act(equipmentUnitId: string, direction: EventDuty["direction"], request: DutyRequest) {
    "use server";
    const current = await requireApprovedUser();
    const result = await actOnEventDuty(db, id, equipmentUnitId, direction, current, request);
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
    await deleteDuties(db, id, [equipmentUnitId]);
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
    await deleteDuties(db, id, dropped);
    revalidatePath(`/events/${id}`);
    return { ok: true as const };
  }

  const resolved = await resolveEventChecklist(db, {
    id,
    seriesId: eventDetails.seriesId,
    eventType: eventDetails.eventType,
  });
  const equipmentNames = new Map(equipmentUnits.map((u) => [u.id, u.name]));
  const equipmentUnitIds = resolved.items.map((i) => i.equipmentUnitId);
  const countByUnit = new Map(resolved.items.map((i) => [i.equipmentUnitId, i.count]));
  const canEditList = committee && !eventDetails.cancelled;
  const [duties, portions, peopleOnEquipment, onlyOnOwnList] = await Promise.all([
    listEventDuties(db, id, equipmentUnitIds, { cancelled: eventDetails.cancelled }),
    listPortionsFor(db, equipmentUnitIds),
    canEditList ? listPeopleOnEquipment(db, id, equipmentUnitIds) : new Map<string, Set<string>>(),
    canEditList && resolved.source === "event" ? unitsOnlyOnOwnList(listTarget) : [],
  ]);
  const clashes = warnings.clashes.filter((c) => c.eventIds.includes(id));
  const headsUps = warnings.headsUps.filter((h) => h.eventIds.includes(id));
  const approved = people.filter((p) => p.accessState === "approved");
  const personName = new Map(people.map((p) => [p.id, displayName(p)]));
  const dutyFor = (kid: string, direction: EventDuty["direction"]) =>
    duties.find((d) => d.equipmentUnitId === kid && d.direction === direction)!;

  const equipmentById = new Map(equipmentUnits.map((u: EquipmentUnit) => [u.id, u]));
  const portionsByUnit = Map.groupBy(portions, (p) => p.equipmentUnitId);
  const eventNames = await listEventTitles(db, portions.flatMap((p) => (p.lastSeenEventId ? [p.lastSeenEventId] : [])));
  const storeName = (storeId: string | null) => stores.find((s: Store) => s.id === storeId)?.name ?? "a store";
  const nameOf = (userId: string | null) => (userId === user.id ? "You" : userId ? (personName.get(userId) ?? "Someone") : null);
  const whereaboutsNow = (equipmentUnitId: string) =>
    describeWhereabouts(portionsByUnit.get(equipmentUnitId) ?? [], {
      storeName: (sid) => storeName(sid),
      personName: (holderId) => (holderId === user.id ? "you" : (nameOf(holderId) ?? "someone")),
      eventName: (eventId) => eventNames.get(eventId) ?? "an event",
    });
  const namesOf = (userIds: string[]) => joinList(userIds.map((uid) => (uid === user.id ? "You" : (nameOf(uid) ?? "Someone"))));
  /** Names for a confirmation sentence, so the viewer is "you". */
  const affectedNames = (userIds: Iterable<string> | undefined) =>
    [...(userIds ?? [])].map((uid) => (uid === user.id ? "you" : (personName.get(uid) ?? "someone")));
  const dutyEquipment: DutyEquipment[] = equipmentUnitIds.map((kid) => {
    const unit = equipmentById.get(kid);
    const homeId = unit?.homeId ?? null;
    const wholeCount = countByUnit.get(kid) ?? 1;
    const count = wholeCount;
    const equipmentPortions = portionsByUnit.get(kid) ?? [];
    const toDuty = dutyFor(kid, "to");
    const fromDuty = dutyFor(kid, "from");

    const slot = (d: EventDuty): DutySlot => {
      const shares = d.userIds.map((userId) => ({ userId, count: d.shares[userId] ?? null, confirmed: d.confirmedUserIds.includes(userId) }));
      // What Confirming would act on: when everyone said how many, only the People still to do, and just what they claimed.
      const pending = pendingShares(shares);
      const pendingIds = pending.map((p) => p.userId);
      const count = countToMove(wholeCount, pending);
      const needsSource = d.direction === "to" && needsSourceChoice(equipmentPortions, { dutyUserIds: pendingIds, count });
      const sourceOptions: SourceOption[] = needsSource
        ? gatherConfirmSources(equipmentPortions, { dutyUserIds: pendingIds, homeStoreId: homeId ?? "", count }).sources.map((s) => ({
            value: placeKey(s.place),
            label:
              s.place.type === "store"
                ? storeName(s.place.storeId)
                : s.place.type === "holder"
                  ? (nameOf(s.place.holderId) ?? "Someone")
                  : "Not confirmed",
            count: s.count,
          }))
        : [];
      const needsHolder = pendingIds.length > 1 && count > 1 && !holdersFromShares(pending) && (d.direction === "to" || d.destination.type === "holder");
      const holderOptions: HolderOption[] = needsHolder
        ? pendingIds.map((uid) => ({ userId: uid, name: uid === user.id ? "You" : (nameOf(uid) ?? "Someone"), count: uid === user.id ? count : 0 }))
        : [];
      if (needsHolder && !holderOptions.some((h) => h.count > 0)) holderOptions[0].count = count;
      const handedOn =
        d.direction === "from" && !d.confirmedAt && !d.voidedAt && pendingIds.length > 0
          ? handedOnSources(equipmentPortions, { userIds: pendingIds, count }).map((option) => ({
              label: `${namesOf(d.userIds)} ${d.userIds.length === 1 && d.userIds[0] !== user.id ? "has" : "have"} it from ${nameOf(option.holderId)?.replace("You", "you") ?? "someone"}`,
              sources: option.sources,
            }))
          : [];
      return {
        direction: d.direction,
        userIds: d.userIds,
        people: d.userIds.map((uid) => (uid === user.id ? "You" : (nameOf(uid) ?? "Someone"))),
        counts: shares.map((s) => s.count),
        done: shares.map((s) => !!s.confirmed),
        unclaimed: unclaimed(wholeCount, shares),
        mine: d.userIds.includes(user.id),
        confirmed: !!d.confirmedAt,
        voided: !!d.voidedAt,
        actions: dutyActions(
          { direction: d.direction, userIds: d.userIds, doneUserIds: d.confirmedUserIds, confirmed: !!d.confirmedAt, voided: !!d.voidedAt },
          { viewerId: user.id, committee },
        ),
        destination:
          d.destination.type === "store" && d.destination.storeId !== homeId ? `store:${d.destination.storeId}` : d.destination.type === "holder" ? "holder" : "home",
        needsSourceChoice: needsSource,
        sourceOptions,
        needsHolderChoice: needsHolder,
        holderOptions,
        handedOn,
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

  const details = eventDetails.matchDetails;
  const editInitial = {
    date: londonParts(eventDetails.start).date,
    // A Match's kick-off, empty while TBC.
    startTime: eventDetails.startTbc ? "" : londonParts(eventDetails.start).time,
    endTime: londonParts(eventDetails.end).time,
    title: eventDetails.eventType === "social" ? eventDetails.title : "",
    venue: eventDetails.venue,
    notes: eventDetails.notes,
    ...(details && {
      teamId: details.teamId,
      opponent: details.opponent,
      homeAway: details.homeAway,
      competition: details.competition,
      meetTime: details.meetTime ? londonParts(details.meetTime).time : "",
      travelMeetTime: details.travelMeetTime ? londonParts(details.travelMeetTime).time : "",
      travelMeetPoint: details.travelMeetPoint ?? undefined,
      schedule: details.schedule ?? undefined,
      travelAttire: details.travelAttire ?? undefined,
      warmUpAttire: details.warmUpAttire ?? undefined,
      postMatchActivity: details.postMatchActivity ?? undefined,
    }),
  };

  const tabs: EventTab[] = [
    ...(takesReplies(eventDetails.eventType)
      ? [{ id: "availability", label: "Availability", content: <AvailabilitySlot eventId={id} viewer={user} /> }]
      : []),
    {
      id: "kit",
      label: "Kit",
      count: equipmentUnitIds.length,
      content: (
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
      ),
    },
    ...(teamCard ? [{ id: "team", label: "Team sheet", content: <TeamCard card={teamCard} /> }] : []),
  ];

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
          <p>{eventDetails.startTbc ? `${formatDay(eventDetails.start)}, time TBC` : `${formatWhen(eventDetails.start)} – ${formatWhen(eventDetails.end)}`}</p>
          {eventDetails.venue && (
            <p>
              Venue:{" "}
              <a href={mapsSearchUrl(eventDetails.venue)} target="_blank" rel="noreferrer" className="underline">
                {eventDetails.venue}
              </a>
            </p>
          )}
          {eventDetails.notes && <p>Notes: {eventDetails.notes}</p>}

          {eventDetails.matchDetails && (
            <div className="mt-2 flex flex-col gap-1 rounded-md border border-border p-3">
              <p className="font-medium">Match details</p>
              <p>Opponent: {eventDetails.matchDetails.opponent}</p>
              <p>{eventDetails.matchDetails.homeAway === "home" ? "Home" : "Away"}</p>
              <p className="uppercase">{eventDetails.matchDetails.competition}</p>
              <p>Kick-off: {eventDetails.startTbc ? "TBC" : formatWhen(eventDetails.start)}</p>
              <p>Meet time at venue: {eventDetails.matchDetails.meetTime ? formatWhen(eventDetails.matchDetails.meetTime) : "TBC"}</p>
              <p>
                Transport meet time: {eventDetails.matchDetails.travelMeetTime ? formatWhen(eventDetails.matchDetails.travelMeetTime) : "TBC"}
                {eventDetails.matchDetails.travelMeetPoint && ` at ${eventDetails.matchDetails.travelMeetPoint}`}
              </p>
              {eventDetails.matchDetails.schedule && <p>Schedule: {eventDetails.matchDetails.schedule}</p>}
              {eventDetails.matchDetails.travelAttire && <p>Travel attire: {eventDetails.matchDetails.travelAttire}</p>}
              {eventDetails.matchDetails.warmUpAttire && <p>Warm up attire: {eventDetails.matchDetails.warmUpAttire}</p>}
              {eventDetails.matchDetails.postMatchActivity && <p>Post match: {eventDetails.matchDetails.postMatchActivity}</p>}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <ShareButton title={eventDetails.title} size="lg" />
              {committee && eventDetails.eventType === "match" && (
                <Link href={`/events/${id}/selection`} className={buttonVariants({ size: "lg" })}>
                  Pick the team
                </Link>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!eventDetails.cancelled && committee && (
                <form id={`cancel-event-${id}`} action={cancel}>
                  <ConfirmSubmit
                    formId={`cancel-event-${id}`}
                    triggerLabel="Cancel"
                    triggerSize="lg"
                    title="Cancel this event?"
                    description="Nobody will need to bring equipment to it. It stays in the calendar, marked as cancelled."
                    confirmLabel="Cancel event"
                  />
                </form>
              )}
              {canDeleteEvent(user.role) && (
                <form id={`delete-event-${id}`} action={remove}>
                  <ConfirmSubmit
                    formId={`delete-event-${id}`}
                    triggerLabel="Delete"
                    triggerSize="lg"
                    className="bg-destructive/25 hover:bg-destructive/35 dark:bg-destructive/25 dark:hover:bg-destructive/35"
                    title="Delete this event?"
                    description="This removes it for good, along with its duties, replies and team picks. It can't be undone. If it just isn't happening, cancel it instead."
                    confirmLabel="Delete event"
                  />
                </form>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <ClashList clashes={clashes} />
      <EventTabs tabs={tabs} />

      {physioList && (
        <CopySummary text={physioList} title="Physio Message" buttonLabel="Copy physio message" copiedMessage="Copied. Paste it to the physio." />
      )}
    </div>
  );
}
