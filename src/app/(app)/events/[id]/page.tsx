import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { cancelEvent, editOccurrence, getEvent, londonParts } from "@/features/events";
import { getLocation, listLocations, type Location } from "@/features/locations";
import { isCommitteeOrAbove } from "@/features/users";
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
