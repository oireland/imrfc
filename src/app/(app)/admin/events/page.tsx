import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { createEvent, listTeams, type Competition, type EventType, type HomeAway } from "@/features/events";
import { listLocations, type Location } from "@/features/locations";
import { isCommitteeOrAbove } from "@/features/users";
import { getCurrentUser } from "@/lib/session";

export default async function AdminEventsPage() {
  const user = await getCurrentUser();
  if (!user || !isCommitteeOrAbove(user.role)) redirect("/");

  const [venues, teams] = await Promise.all([
    listLocations(db).then((ls: Location[]) => ls.filter((l) => l.isVenue)),
    listTeams(db),
  ]);

  async function create(formData: FormData) {
    "use server";
    const eventType = formData.get("eventType") as EventType;
    const start = new Date(String(formData.get("start")));
    const end = new Date(String(formData.get("end")));
    const teamIds = formData.getAll("teamIds").map(String);

    const common = {
      title: String(formData.get("title")),
      start,
      end,
      venueId: String(formData.get("venueId")),
      notes: String(formData.get("notes") ?? ""),
      teamIds,
    };

    await createEvent(
      db,
      eventType === "match"
        ? {
            ...common,
            eventType,
            matchDetails: {
              opponent: String(formData.get("opponent")),
              homeAway: formData.get("homeAway") as HomeAway,
              competition: formData.get("competition") as Competition,
              meetTime: new Date(String(formData.get("meetTime") || formData.get("start"))),
            },
          }
        : { ...common, eventType },
    );
    revalidatePath("/admin/events");
    revalidatePath("/events");
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold">Add an Event</h2>

      <form action={create} className="flex flex-col gap-3 rounded-md border border-border p-3">
        <input
          name="title"
          placeholder="Title"
          required
          className="rounded-md border border-border bg-background px-2 py-1"
        />
        <select
          name="eventType"
          required
          className="rounded-md border border-border bg-background px-2 py-1"
        >
          <option value="training">Training</option>
          <option value="match">Match</option>
          <option value="social">Social</option>
        </select>
        <label className="flex flex-col text-sm">
          Start
          <input
            type="datetime-local"
            name="start"
            required
            className="rounded-md border border-border bg-background px-2 py-1"
          />
        </label>
        <label className="flex flex-col text-sm">
          End
          <input
            type="datetime-local"
            name="end"
            required
            className="rounded-md border border-border bg-background px-2 py-1"
          />
        </label>
        <select
          name="venueId"
          required
          className="rounded-md border border-border bg-background px-2 py-1"
        >
          <option value="">Venue...</option>
          {venues.map((v: Location) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend>Teams (none = whole club)</legend>
          {teams.map((t) => (
            <label key={t.id} className="flex items-center gap-2">
              <input type="checkbox" name="teamIds" value={t.id} /> {t.name}
            </label>
          ))}
        </fieldset>
        <textarea
          name="notes"
          placeholder="Notes"
          className="rounded-md border border-border bg-background px-2 py-1"
        />

        <fieldset className="flex flex-col gap-2 rounded-md border border-border p-2 text-sm">
          <legend>Match details (if Match)</legend>
          <input
            name="opponent"
            placeholder="Opponent"
            className="rounded-md border border-border bg-background px-2 py-1"
          />
          <select name="homeAway" className="rounded-md border border-border bg-background px-2 py-1">
            <option value="home">Home</option>
            <option value="away">Away</option>
          </select>
          <select
            name="competition"
            className="rounded-md border border-border bg-background px-2 py-1"
          >
            <option value="bucs">BUCS</option>
            <option value="lusl">LUSL</option>
            <option value="friendly">Friendly</option>
            <option value="other">Other</option>
          </select>
          <label className="flex flex-col">
            Meet time
            <input
              type="datetime-local"
              name="meetTime"
              className="rounded-md border border-border bg-background px-2 py-1"
            />
          </label>
        </fieldset>

        <button className="rounded-md bg-primary px-3 py-1 text-primary-foreground">Add</button>
      </form>
    </div>
  );
}
