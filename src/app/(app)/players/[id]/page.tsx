import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { BackLink } from "@/components/back-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MobileNumberField } from "@/components/mobile-number-field";
import { PositionsPicker } from "@/components/positions-picker";
import { SubmitButton } from "@/components/submit-button";
import { getSeasonRecord, type RecordLine, type ReplyCounts } from "@/features/availability";
import { listEquipmentUnits } from "@/features/equipment";
import { getMobileNumber, setMobileNumber, whatsappLink } from "@/features/contact";
import { getPlayer, setPlayerPositions, setPlaying } from "@/features/players";
import { formatWhen } from "@/lib/format-time";
import { isCommitteeOrAbove, type RugbyPosition } from "@/features/users";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/session";

export default async function PlayerPage({ params }: PageProps<"/players/[id]">) {
  const user = await getCurrentUser();
  if (!user || !isCommitteeOrAbove(user.role)) redirect("/");

  const { id } = await params;
  const [player, equipmentUnits, availability, mobileNumber] = await Promise.all([
    getPlayer(db, id),
    listEquipmentUnits(db, { includeRetired: true }),
    getSeasonRecord(db, id),
    getMobileNumber(db, user, id),
  ]);
  if (!player) redirect("/players");

  const equipmentName = new Map(equipmentUnits.map((k) => [k.id, k.name]));

  async function savePositions(preferred: RugbyPosition, other: RugbyPosition[]) {
    "use server";
    const current = await getCurrentUser();
    if (!current || !isCommitteeOrAbove(current.role)) redirect("/");
    await setPlayerPositions(db, id, preferred, other);
    revalidatePath(`/players/${id}`);
    revalidatePath("/players");
  }

  async function saveMobileNumber(input: string) {
    "use server";
    const current = await getCurrentUser();
    if (!current || !isCommitteeOrAbove(current.role)) redirect("/");
    const result = await setMobileNumber(db, current, id, input);
    if (result.ok) revalidatePath(`/players/${id}`);
    return result;
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
          <PositionsPicker
            initialPreferred={player.preferredPosition as RugbyPosition | null}
            initialOther={player.otherPositions as RugbyPosition[]}
            save={savePositions}
          />

          <form action={togglePlaying}>
            <input type="hidden" name="playing" value={(!player.playing).toString()} />
            <SubmitButton variant="outline">{player.playing ? "Switch Playing off" : "Switch Playing on"}</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-heading text-[22px] leading-tight">Mobile number</h3>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!mobileNumber && (
            <p className="text-sm text-muted-foreground">No number yet. Add one so you can message {player.name.split(" ")[0]} on WhatsApp.</p>
          )}
          <MobileNumberField
            id="player-mobile"
            label={mobileNumber ? "Number" : "Add a number"}
            initialNumber={mobileNumber}
            save={saveMobileNumber}
          />
          {mobileNumber && (
            <a
              href={whatsappLink(mobileNumber)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline" }) + " self-start"}
            >
              WhatsApp
            </a>
          )}
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
