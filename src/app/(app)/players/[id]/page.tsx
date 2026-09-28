import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { BackLink } from "@/components/back-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/submit-button";
import { getSeasonRecord, type RecordLine, type ReplyCounts } from "@/features/availability";
import { listEquipmentUnits } from "@/features/equipment";
import { getPlayer, setPlayerPositions, setPlaying } from "@/features/players";
import { formatWhen } from "@/lib/format-time";
import { RUGBY_POSITIONS, isCommitteeOrAbove, type RugbyPosition } from "@/features/users";
import { getCurrentUser } from "@/lib/session";

export default async function PlayerPage({ params }: PageProps<"/players/[id]">) {
  const user = await getCurrentUser();
  if (!user || !isCommitteeOrAbove(user.role)) redirect("/");

  const { id } = await params;
  const [player, equipmentUnits, availability] = await Promise.all([
    getPlayer(db, id),
    listEquipmentUnits(db, { includeRetired: true }),
    getSeasonRecord(db, id),
  ]);
  if (!player) redirect("/players");

  const equipmentName = new Map(equipmentUnits.map((k) => [k.id, k.name]));

  async function savePositions(formData: FormData) {
    "use server";
    const current = await getCurrentUser();
    if (!current || !isCommitteeOrAbove(current.role)) redirect("/");
    const preferred = String(formData.get("preferred")) as RugbyPosition;
    const other = formData.getAll("other") as RugbyPosition[];
    await setPlayerPositions(db, id, preferred, other);
    revalidatePath(`/players/${id}`);
    revalidatePath("/players");
  }

  async function togglePlaying(formData: FormData) {
    "use server";
    const current = await getCurrentUser();
    if (!current || !isCommitteeOrAbove(current.role)) redirect("/");
    await setPlaying(db, id, formData.get("playing") === "true");
    revalidatePath(`/players/${id}`);
    revalidatePath("/players");
  }

  const { upcoming, season, last } = player.dutyRecord;
  const counts = (c: ReplyCounts) => `available ${c.available} · not ${c.notAvailable} · no reply ${c.noReply}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <BackLink href="/players">Players</BackLink>
        <div className="flex items-center gap-2">
          <h2 className="font-heading text-[40px] leading-none tracking-tight">{player.name}</h2>
          {!player.playing && <Badge variant="secondary">Not playing</Badge>}
        </div>
      </div>

      <Card>
        <CardHeader>
          <h3 className="font-heading text-[22px] leading-tight">Positions</h3>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={savePositions} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="preferred-position">Preferred Position</Label>
              <NativeSelect id="preferred-position" name="preferred" defaultValue={player.preferredPosition ?? ""} required>
                <NativeSelectOption value="" disabled>
                  Choose a position
                </NativeSelectOption>
                {RUGBY_POSITIONS.map((position) => (
                  <NativeSelectOption key={position} value={position}>
                    {position}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-0.5 text-sm font-medium">Other Positions</legend>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {RUGBY_POSITIONS.map((position) => (
                  <label key={position} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="other" value={position} defaultChecked={player.otherPositions.includes(position)} />
                    {position}
                  </label>
                ))}
              </div>
            </fieldset>
            <SubmitButton variant="secondary" className="self-start">
              Save positions
            </SubmitButton>
          </form>

          <form action={togglePlaying}>
            <input type="hidden" name="playing" value={(!player.playing).toString()} />
            <SubmitButton variant="outline">{player.playing ? "Switch Playing off" : "Switch Playing on"}</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-heading text-[22px] leading-tight">Duties</h3>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-muted-foreground">Upcoming</p>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing to bring or take back.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {upcoming.map(({ duty, event, count }) => (
                  <li key={duty.id} className="text-sm">
                    {duty.direction === "to" ? "Bring" : "Take back"} {equipmentName.get(duty.equipmentUnitId) ?? "Equipment"}
                    {count > 1 && ` ×${count}`} — {event.title}, {formatWhen(duty.direction === "to" ? event.start : event.end)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-muted-foreground">This season</p>
            <p className="text-sm">
              {season.done} done · {season.neverConfirmed} never confirmed
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-muted-foreground">Last 5</p>
            {last.length === 0 ? (
              <p className="text-sm text-muted-foreground">No past duties yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {last.map((r) => (
                  <li key={r.dutyId} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      {r.direction === "to" ? "Bring" : "Take back"} {equipmentName.get(r.equipmentUnitId) ?? "Equipment"} — {r.event.title}
                    </span>
                    <Badge variant={r.confirmedAt ? "secondary" : "destructive"}>{r.confirmedAt ? "Done" : "Never confirmed"}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-heading text-[22px] leading-tight">Availability this season</h3>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {(
            [
              ["Matches", availability.matches],
              ["Training", availability.training],
            ] as [string, RecordLine][]
          ).map(([label, line]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <p>
                {label}: {counts(line.all)}
              </p>
              <p className="text-muted-foreground">Announced only: {counts(line.announced)}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
