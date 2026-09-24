import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { createSeries, extendSeries, listSeries, listTeams } from "@/features/events";
import { listLocations, type Location } from "@/features/locations";
import { isCommitteeOrAbove } from "@/features/users";
import { getCurrentUser } from "@/lib/session";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const field = "rounded-md border border-border bg-background px-2 py-1";

export default async function AdminSeriesPage() {
  const user = await getCurrentUser();
  if (!user || !isCommitteeOrAbove(user.role)) redirect("/");

  const [venues, teams, allSeries] = await Promise.all([
    listLocations(db).then((ls: Location[]) => ls.filter((l) => l.isVenue)),
    listTeams(db),
    listSeries(db),
  ]);

  async function create(formData: FormData) {
    "use server";
    await createSeries(db, {
      title: String(formData.get("title")),
      weekdays: formData.getAll("weekdays").map(Number),
      startTime: String(formData.get("startTime")),
      endTime: String(formData.get("endTime")),
      venueId: String(formData.get("venueId")),
      startDate: String(formData.get("startDate")),
      endDate: String(formData.get("endDate")),
      notes: String(formData.get("notes") ?? ""),
      teamIds: formData.getAll("teamIds").map(String),
    });
    revalidatePath("/admin/series");
    revalidatePath("/events");
  }

  async function extend(formData: FormData) {
    "use server";
    await extendSeries(db, String(formData.get("seriesId")), String(formData.get("endDate")));
    revalidatePath("/admin/series");
    revalidatePath("/events");
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold">Add a Series</h2>
      <form action={create} className="flex flex-col gap-3 rounded-md border border-border p-3">
        <input name="title" placeholder="Title" required className={field} />
        <fieldset className="flex flex-wrap gap-3 text-sm">
          <legend>Weekdays</legend>
          {WEEKDAYS.map((name, i) => (
            <label key={name} className="flex items-center gap-1">
              <input type="checkbox" name="weekdays" value={i} /> {name}
            </label>
          ))}
        </fieldset>
        <div className="flex gap-2">
          <label className="flex flex-col text-sm">
            Start time
            <input type="time" name="startTime" required className={field} />
          </label>
          <label className="flex flex-col text-sm">
            End time
            <input type="time" name="endTime" required className={field} />
          </label>
        </div>
        <div className="flex gap-2">
          <label className="flex flex-col text-sm">
            First date
            <input type="date" name="startDate" required className={field} />
          </label>
          <label className="flex flex-col text-sm">
            End date
            <input type="date" name="endDate" required className={field} />
          </label>
        </div>
        <select name="venueId" required className={field}>
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
        <textarea name="notes" placeholder="Notes" className={field} />
        <button className="rounded-md bg-primary px-3 py-1 text-primary-foreground">Create Series</button>
      </form>

      <h2 className="text-xl font-semibold">Series</h2>
      <ul className="flex flex-col gap-3">
        {allSeries.map((s) => (
          <li key={s.id} className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
            <p className="font-medium">{s.title}</p>
            <p className="text-muted-foreground">
              {s.weekdays.map((d) => WEEKDAYS[d]).join(", ")} {s.startTime}–{s.endTime}, {s.startDate} to {s.endDate}
            </p>
            <form action={extend} className="flex gap-2">
              <input type="hidden" name="seriesId" value={s.id} />
              <input type="date" name="endDate" required className={field} />
              <button className="rounded-md bg-primary px-3 py-1 text-primary-foreground">Extend</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
