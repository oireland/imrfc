import { redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { createEvent, listTeams, type Competition, type EventType, type HomeAway } from "@/features/events";
import { listLocations, type Location } from "@/features/locations";
import { isCommitteeOrAbove } from "@/features/users";
import { getCurrentUser } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";

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
    <div className="flex flex-col gap-6 p-4">
      <div className="flex flex-col gap-1">
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Admin
        </Link>
        <h2 className="text-xl font-semibold">Events Admin</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Event</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={create} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-title">Title</Label>
              <Input id="event-title" name="title" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-type">Event Type</Label>
              <NativeSelect id="event-type" name="eventType" required>
                <NativeSelectOption value="training">Training</NativeSelectOption>
                <NativeSelectOption value="match">Match</NativeSelectOption>
                <NativeSelectOption value="social">Social</NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-start">Start</Label>
              <Input id="event-start" type="datetime-local" name="start" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-end">End</Label>
              <Input id="event-end" type="datetime-local" name="end" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-venue">Venue</Label>
              <NativeSelect id="event-venue" name="venueId" required>
                <NativeSelectOption value="">Venue...</NativeSelectOption>
                {venues.map((v: Location) => (
                  <NativeSelectOption key={v.id} value={v.id}>
                    {v.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <fieldset className="flex flex-col gap-1 text-sm">
              <legend className="mb-1 font-medium">Teams (none = whole club)</legend>
              {teams.map((t) => (
                <label key={t.id} className="flex items-center gap-2">
                  <input type="checkbox" name="teamIds" value={t.id} className="size-4" /> {t.name}
                </label>
              ))}
            </fieldset>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-notes">Notes</Label>
              <Textarea id="event-notes" name="notes" />
            </div>

            <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3 text-sm">
              <legend className="px-1 font-medium">Match details (if Match)</legend>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="event-opponent">Opponent</Label>
                <Input id="event-opponent" name="opponent" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="event-home-away">Home / Away</Label>
                <NativeSelect id="event-home-away" name="homeAway">
                  <NativeSelectOption value="home">Home</NativeSelectOption>
                  <NativeSelectOption value="away">Away</NativeSelectOption>
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="event-competition">Competition</Label>
                <NativeSelect id="event-competition" name="competition">
                  <NativeSelectOption value="bucs">BUCS</NativeSelectOption>
                  <NativeSelectOption value="lusl">LUSL</NativeSelectOption>
                  <NativeSelectOption value="friendly">Friendly</NativeSelectOption>
                  <NativeSelectOption value="other">Other</NativeSelectOption>
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="event-meet-time">Meet time</Label>
                <Input id="event-meet-time" type="datetime-local" name="meetTime" />
              </div>
            </fieldset>

            <SubmitButton>Add</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
