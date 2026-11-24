import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { BackLink } from "@/components/back-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MobileNumberField } from "@/components/mobile-number-field";
import { AwayCard } from "@/components/away-card";
import { InjuriesCard, StatusPill } from "@/components/injuries-card";
import { PositionsPicker } from "@/components/positions-picker";
import { SubmitButton } from "@/components/submit-button";
import { getSeasonRecord, type RecordLine, type ReplyCounts } from "@/features/availability";
import { listEquipmentUnits } from "@/features/equipment";
import { getMobileNumber, whatsappLink } from "@/features/contact";
import { listInjuries, STATUS_LABEL, worstFitness, type OpenStatus } from "@/features/injuries";
import { getPlayer, listAway } from "@/features/players";
import { londonDay } from "@/lib/time/london";
import { formatWhen } from "@/lib/time/format-time";
import type { RugbyPosition } from "@/features/users";
import { buttonVariants } from "@/components/ui/button";
import { requireCommittee } from "@/lib/auth/session";
import { addAwayAction, editAwayAction, imBackAction, removeAwayAction } from "../../away-actions";
import { awayItems } from "../../away-items";
import { recentEventOptions } from "../../injury-events";
import { saveMobileNumberAction, savePositionsAction, togglePlayingAction } from "../../player-actions";
import { clearInjuryAction, logByMistakeAction, reportInjuryAction, updateInjuryAction } from "../../injury-actions";
import { injuryItems } from "../../injury-items";

export default async function PlayerPage({ params }: PageProps<"/players/[id]">) {
  const user = await requireCommittee();

  const { id } = await params;
  const today = londonDay();
  const [player, equipmentUnits, availability, mobileNumber, awayListing, injuries, eventOptions] = await Promise.all([
    getPlayer(db, id),
    listEquipmentUnits(db, { includeRetired: true }),
    getSeasonRecord(db, id),
    getMobileNumber(db, user, id),
    listAway(db, user, id, today),
    listInjuries(db, user, id, today),
    recentEventOptions(),
  ]);
  if (!player) redirect("/players");

  const fitness = worstFitness(injuries.open.map((i) => i.status as OpenStatus));
  const equipmentName = new Map(equipmentUnits.map((k) => [k.id, k.name]));

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
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{player.preferredPosition ?? "No position set"}</span>
          <StatusPill status={fitness === "fit" ? "cleared" : fitness}>{STATUS_LABEL[fitness]}</StatusPill>
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
            save={savePositionsAction.bind(null, id)}
          />

          <form action={togglePlayingAction.bind(null, id)}>
            <input type="hidden" name="playing" value={(!player.playing).toString()} />
            <SubmitButton variant="outline">{player.playing ? "Switch Playing off" : "Switch Playing on"}</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <InjuriesCard
        title="Injuries"
        open={injuryItems(injuries.open)}
        cleared={injuryItems(injuries.history)}
        today={today}
        events={eventOptions}
        emptyText={`${player.name.split(" ")[0]} has nothing hurting.`}
        showCheckIn
        actions={{
          report: reportInjuryAction.bind(null, id),
          update: updateInjuryAction,
          clear: clearInjuryAction,
          mistake: logByMistakeAction,
        }}
      />

      <AwayCard
        title="Time away"
        {...awayItems(awayListing, id)}
        today={today}
        addLabel="Add time away"
        emptyText={`${player.name.split(" ")[0]} isn't away.`}
        actions={{
          add: addAwayAction.bind(null, id),
          edit: editAwayAction,
          imBack: imBackAction,
          remove: removeAwayAction,
        }}
      />

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
            save={saveMobileNumberAction.bind(null, id)}
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
