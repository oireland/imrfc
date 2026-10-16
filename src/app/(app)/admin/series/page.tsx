import { BackLink } from "@/components/back-link";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { createSeries, extendSeries, listSeries, listVenues } from "@/features/events";
import { requireCommittee } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VenueInput } from "@/components/venue-input";
import { Textarea } from "@/components/ui/textarea";
import { ResultForm } from "@/components/result-form";
import { SubmitButton } from "@/components/submit-button";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function AdminSeriesPage() {
  await requireCommittee();

  const [venues, allSeries] = await Promise.all([listVenues(db), listSeries(db)]);

  async function create(formData: FormData) {
    "use server";
    await requireCommittee();
    const result = await createSeries(db, {
      title: String(formData.get("title")),
      eventType: formData.get("eventType") === "social" ? "social" : "training",
      weekdays: formData.getAll("weekdays").map(Number),
      startTime: String(formData.get("startTime")),
      endTime: String(formData.get("endTime")),
      venue: String(formData.get("venue")),
      startDate: String(formData.get("startDate")),
      endDate: String(formData.get("endDate")),
      notes: String(formData.get("notes") ?? ""),
    });
    if (!result.ok) return result;
    revalidatePath("/admin/series");
    revalidatePath("/events");
    return { ok: true as const };
  }

  async function extend(formData: FormData) {
    "use server";
    await requireCommittee();
    const result = await extendSeries(db, String(formData.get("seriesId")), String(formData.get("endDate")));
    if (!result.ok) return result;
    revalidatePath("/admin/series");
    revalidatePath("/events");
    return { ok: true as const };
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <BackLink href="/admin">Admin</BackLink>
        <h2 className="font-heading text-[40px] leading-none tracking-tight">Series</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New series</CardTitle>
        </CardHeader>
        <CardContent>
          <ResultForm action={create} successMessage="Series created" className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="series-title">Title (Socials only)</Label>
              <Input id="series-title" name="title" placeholder="Training is called “Training @ Venue”" />
            </div>
            <fieldset className="flex gap-3 text-sm">
              <legend className="mb-1 font-medium">Event type</legend>
              <label className="flex items-center gap-1">
                <input type="radio" name="eventType" value="training" defaultChecked className="size-4" /> Training
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" name="eventType" value="social" className="size-4" /> Social
              </label>
            </fieldset>
            <fieldset className="flex flex-wrap gap-3 text-sm">
              <legend className="mb-1 font-medium">Weekdays</legend>
              {WEEKDAYS.map((name, i) => (
                <label key={name} className="flex items-center gap-1">
                  <input type="checkbox" name="weekdays" value={i} className="size-4" /> {name}
                </label>
              ))}
            </fieldset>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="series-start-time">Start time</Label>
              <Input id="series-start-time" type="time" name="startTime" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="series-end-time">End time</Label>
              <Input id="series-end-time" type="time" name="endTime" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="series-start-date">First date</Label>
              <Input id="series-start-date" type="date" name="startDate" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="series-end-date">End date</Label>
              <Input id="series-end-date" type="date" name="endDate" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="series-venue">Venue</Label>
              <VenueInput id="series-venue" name="venue" suggestions={venues} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="series-notes">Notes</Label>
              <Textarea id="series-notes" name="notes" />
            </div>
            <SubmitButton>Create series</SubmitButton>
          </ResultForm>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-muted-foreground">Current series</h3>
        <Card className="py-0">
          <div className="divide-y divide-border">
            {allSeries.length === 0 && <p className="p-4 text-muted-foreground">No series yet.</p>}
            {allSeries.map((s) => {
              const extendFormId = `extend-date-${s.id}`;
              return (
                <div key={s.id} className="flex flex-col gap-2 p-4 text-sm">
                  <p className="font-medium">
                    {s.title} <span className="font-normal text-muted-foreground capitalize">· {s.eventType}</span>
                  </p>
                  <p className="text-muted-foreground">
                    {s.weekdays.map((d) => WEEKDAYS[d]).join(", ")} {s.startTime}–{s.endTime},{" "}
                    {s.startDate} to {s.endDate}
                  </p>
                  <ResultForm action={extend} successMessage="Series extended" className="flex items-end gap-2">
                            <input type="hidden" name="seriesId" value={s.id} />
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={extendFormId}>Extend to</Label>
                      <Input id={extendFormId} type="date" name="endDate" required />
                    </div>
                    <SubmitButton size="sm" variant="outline">
                      Extend
                    </SubmitButton>
                          </ResultForm>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
