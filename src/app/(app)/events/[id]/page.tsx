import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { ChecklistEditor } from "@/components/checklist-editor";
import { resolveEventChecklist } from "@/features/checklists";
import { listKitUnits } from "@/features/kit";
import {
  assignDuty,
  claimDuty,
  ensureDuties,
  handOnDuty,
  setDestination,
  unassignDuty,
  type Duty,
  type DutyDestination,
} from "@/features/duties";
import { cancelEvent, editOccurrence, getEvent, londonParts } from "@/features/events";
import { getLocation, listLocations, type Location } from "@/features/locations";
import { isCommitteeOrAbove, listApprovedUsers } from "@/features/users";
import { requireApprovedUser } from "@/lib/session";

function formatTime(d: Date) {
  return d.toLocaleString?.("en-GB", { timeZone: "Europe/London" }) ?? String(d);
}

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

  const field = "rounded-md border border-border bg-background px-2 py-1";

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
      <div className="flex flex-col gap-1 border-t border-border pt-2 first:border-t-0 first:pt-0">
        <p>
          <span className="font-medium">{label}:</span>{" "}
          {d.userId ? (
            <span className={mine ? "rounded-md bg-accent px-1 text-accent-foreground" : undefined}>
              {mine ? "You" : (personName.get(d.userId) ?? d.userId)}
            </span>
          ) : (
            <span className="text-destructive">❗unassigned</span>
          )}
        </p>
        <form action={duty} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="dutyId" value={d.id} />
          {!d.userId && (
            <button name="action" value="claim" className="rounded-md bg-primary px-3 py-1 text-primary-foreground">
              Claim
            </button>
          )}
          {(mine || committee) && (
            <>
              <select name="userId" aria-label={`${label} Duty person`} className={field}>
                {approved.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {mine && <button name="action" value="handOn" className={field}>Hand on</button>}
              {committee && <button name="action" value="assign" className={field}>Assign</button>}
              {committee && d.userId && <button name="action" value="unassign" className={field}>Unassign</button>}
            </>
          )}
        </form>
        {d.direction === "from" && (
          <form action={duty} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="dutyId" value={d.id} />
            <input type="hidden" name="action" value="destination" />
            <span className="text-muted-foreground">Destination:</span>
            {committee ? (
              <>
                <select
                  name="destination"
                  aria-label="Destination"
                  defaultValue={d.destination.type === "store" ? `store:${d.destination.storeId}` : d.destination.type}
                  className={field}
                >
                  <option value="home">Home</option>
                  {stores.map((s: Location) => (
                    <option key={s.id} value={`store:${s.id}`}>{s.name}</option>
                  ))}
                  <option value="holder">Stays with the Duty&apos;s User</option>
                </select>
                <button className={field}>Set</button>
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
  const sourceLabel = { event: "this Event", series: "its Series", default: "the Default Checklist", none: "" }[
    resolved.source
  ];

  const venues = eventDetails.seriesId ? (await listLocations(db)).filter((l: Location) => l.isVenue) : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">
          {eventDetails.title}
          {eventDetails.cancelled && (
            <span className="ml-2 rounded-md bg-destructive px-1.5 py-0.5 text-xs text-destructive-foreground align-middle">
              Cancelled
            </span>
          )}
        </h2>
        <p className="text-sm text-muted-foreground capitalize">{eventDetails.eventType}</p>
      </div>

      <div className="flex flex-col gap-1 text-sm">
        <p>Start: {formatTime(eventDetails.start)}</p>
        <p>End: {formatTime(eventDetails.end)}</p>
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
      </div>

      {eventDetails.matchDetails && (
        <div className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm">
          <h3 className="font-medium">Match details</h3>
          <p>Opponent: {eventDetails.matchDetails.opponent}</p>
          <p>{eventDetails.matchDetails.homeAway === "home" ? "Home" : "Away"}</p>
          <p className="uppercase">{eventDetails.matchDetails.competition}</p>
          <p>Kick-off: {formatTime(eventDetails.start)}</p>
          <p>Meet time: {formatTime(eventDetails.matchDetails.meetTime)}</p>
          {eventDetails.matchDetails.travelMeetTime && (
            <p>
              Travel meet: {formatTime(eventDetails.matchDetails.travelMeetTime)}
              {eventDetails.matchDetails.travelMeetPoint &&
                ` at ${eventDetails.matchDetails.travelMeetPoint}`}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
        <h3 className="font-medium">Checklist{sourceLabel && ` (from ${sourceLabel})`}</h3>
        <ul className="flex flex-col gap-4">
          {resolved.kitUnitIds.map((kid) => (
            <li key={kid} className="flex flex-col gap-2">
              <span className="font-medium">{kitNames.get(kid) ?? kid}</span>
              <DutyRow d={dutyFor(kid, "to")} />
              <DutyRow d={dutyFor(kid, "from")} />
            </li>
          ))}
          {resolved.kitUnitIds.length === 0 && <li className="text-muted-foreground">No Kit Units needed.</li>}
        </ul>
      </div>

      {isCommitteeOrAbove(user.role) && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <h3 className="font-medium">Override Checklist for this Event</h3>
          <ChecklistEditor
            target={{ scope: "event", scopeId: id }}
            path={`/events/${id}`}
            inheritedFrom={sourceLabel ? `Checklist from ${sourceLabel}` : undefined}
          />
        </div>
      )}

      {eventDetails.seriesId && !eventDetails.cancelled && isCommitteeOrAbove(user.role) && (
        <form action={edit} className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
          <h3 className="font-medium">Edit this Occurrence</h3>
          <input name="title" defaultValue={eventDetails.title} required className="rounded-md border border-border bg-background px-2 py-1" />
          <div className="flex gap-2">
            <input type="time" name="startTime" defaultValue={londonParts(eventDetails.start).time} required className="rounded-md border border-border bg-background px-2 py-1" />
            <input type="time" name="endTime" defaultValue={londonParts(eventDetails.end).time} required className="rounded-md border border-border bg-background px-2 py-1" />
          </div>
          <select name="venueId" defaultValue={eventDetails.venueId} className="rounded-md border border-border bg-background px-2 py-1">
            {venues.map((v: Location) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          <select name="scope" className="rounded-md border border-border bg-background px-2 py-1">
            <option value="this">This one</option>
            <option value="future">This and future</option>
          </select>
          <button className="rounded-md bg-primary px-3 py-1 text-primary-foreground">Save</button>
        </form>
      )}

      {!eventDetails.cancelled && isCommitteeOrAbove(user.role) && (
        <form action={cancel}>
          <button className="rounded-md bg-destructive px-3 py-1 text-destructive-foreground">
            Cancel Event
          </button>
        </form>
      )}
    </div>
  );
}
