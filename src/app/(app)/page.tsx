import { markUnconfirmedOnce } from "./request-cache";
import { Fragment } from "react";
import Link from "next/link";
import { db } from "@/db/client";
import { CanYouMakeIt } from "@/components/can-you-make-it";
import { ComingUp } from "@/components/coming-up";
import { AwayHomeCard } from "@/components/away-home-card";
import { CrestThemePicker } from "@/components/crest-theme-picker";
import { HealthStack } from "@/components/health-stack";
import { InjuryHomeCard } from "@/components/injury-home-card";
import { listWaitingOnReply } from "@/features/availability";
import { listUpcomingDutiesForUser, othersOnDuty } from "@/features/duties";
import { listEquipmentHeldBy, listEquipmentUnits } from "@/features/equipment";
import { listInjuries } from "@/features/injuries";
import { listAway } from "@/features/players";
import { listPlayingFor } from "@/features/selection";
import { displayName, isCommitteeOrAbove, loadNames } from "@/features/users";
import { greeting } from "@/lib/time/calendar";
import { formatDate } from "@/lib/time/format-time";
import { londonDay, londonTime } from "@/lib/time/london";
import { requireApprovedUser } from "@/lib/auth/session";
import { cn } from "cn";
import { quickAddEvent, saveMyReply, setTheme } from "./actions";
import { imBackAction } from "./away-actions";
import { clearInjuryAction, logByMistakeAction, reportInjuryAction, updateInjuryAction } from "./injury-actions";
import { injuryItems } from "./injury-items";
import { loadComingUp } from "./coming-up-data";

/** How many held Equipment Units the greeting names before "& N more". */
const HELD_SHOWN = 2;

/** "Today", "Tomorrow", a weekday within the week, else "Sat 11 Oct". */
function relativeDay(start: Date, today: string): string {
  const days = Math.round((Date.parse(londonDay(start)) - Date.parse(today)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  const opts: Intl.DateTimeFormatOptions =
    days < 7 ? { weekday: "long" } : { weekday: "short", day: "numeric", month: "short" };
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "Europe/London" }).format(start);
}

export default async function Home() {
  const user = await requireApprovedUser();

  await markUnconfirmedOnce();
  const upcomingDuties = listUpcomingDutiesForUser(db, user.id);
  const [asks, playing, duties, held, comingUp, allEquipment, name, away, injuries] = await Promise.all([
    listWaitingOnReply(db, user.id),
    listPlayingFor(db, user.id),
    upcomingDuties,
    listEquipmentHeldBy(db, user.id),
    loadComingUp(user.id, upcomingDuties),
    listEquipmentUnits(db, { includeRetired: true }),
    loadNames(db),
    listAway(db, user, user.id, londonDay()),
    listInjuries(db, user, user.id, londonDay()),
  ]);
  const equipmentNames = new Map(allEquipment.map((k) => [k.id, k.name]));
  // A shared Duty is yours for everyone on it: "with Sam".
  const withOthers = (userIds: string[]) => othersOnDuty(userIds, user.id, name);
  const firstName = displayName(user).split(" ")[0];
  // My own health cards, most urgent first; time Away comes last.
  const injuryActions = {
    report: reportInjuryAction.bind(null, user.id),
    update: updateInjuryAction,
    clear: clearInjuryAction,
    mistake: logByMistakeAction,
  };
  const injuryCards = injuryItems(injuries.open).map((injury) => (
    <InjuryHomeCard
      key={injury.id}
      injury={{
        id: injury.id,
        area: injury.area,
        since: injury.since,
        status: injury.status as "out" | "training_only" | "playing_through",
        expectedReturn: injury.expectedReturn,
        expectedPassed: injury.stillExpecting !== null,
        needsPhysio: injury.needsPhysio,
        physioNote: injury.physioNote,
      }}
      statusLabel={injury.statusLabel}
      summary={injury.since}
      stillExpecting={injury.stillExpecting}
      actions={injuryActions}
    />
  ));
  const awayCards = away.current.map((period) => (
    <AwayHomeCard key={period.id} until={formatDate(period.until)} reason={period.reason} imBack={imBackAction.bind(null, period.id)} />
  ));
  const healthCards = [...injuryCards, ...awayCards];

  return (
    <div className="flex flex-col gap-9">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-heading text-[44px] leading-[1.02] tracking-tight">
            {greeting(new Date(comingUp.now))},
            <br />
            <span className="break-words italic">{firstName}.</span>
          </h1>
          <p className="mt-3 text-[15px] text-muted-foreground">
            {duties.length === 0 ? "No duties coming up." : `${duties.length} ${duties.length === 1 ? "duty" : "duties"} coming up.`}
          </p>
          {held.length > 0 && (
            <p className="mt-1 text-[15px] text-muted-foreground">
              {"You've got: "}
              {held.slice(0, HELD_SHOWN).map((unit, i, shown) => (
                <Fragment key={unit.id}>
                  {i > 0 && (i === shown.length - 1 && held.length <= HELD_SHOWN ? " & " : ", ")}
                  <Link href={`/equipment/${unit.id}`} className="text-foreground underline-offset-4 hover:underline">
                    {unit.name}
                    {unit.count > 1 && ` ×${unit.count}`}
                  </Link>
                </Fragment>
              ))}
              {held.length > HELD_SHOWN && (
                <>
                  {" & "}
                  <Link href="/equipment" className="text-foreground underline-offset-4 hover:underline">
                    {held.length - HELD_SHOWN} more
                  </Link>
                </>
              )}
            </p>
          )}
        </div>
        <CrestThemePicker theme={user.theme} onChange={setTheme} />
      </header>

      <HealthStack cards={healthCards} />

      <CanYouMakeIt asks={asks} now={new Date(comingUp.now)} reply={saveMyReply} />

      {playing.length > 0 && (
        <section aria-labelledby="youre-playing" className="flex flex-col gap-3">
          <h2 id="youre-playing" className="font-heading text-[28px] leading-none">
            You&apos;re playing
          </h2>
          <ul className="flex flex-col gap-2.5">
            {playing.map((match) => (
              <li key={match.eventId}>
                <Link
                  href={`/events/${match.eventId}`}
                  className="flex items-center justify-between gap-3 rounded-[20px] bg-lead p-4 text-lead-foreground transition-transform active:scale-[0.98]"
                >
                  <span>
                    <span className="block font-heading text-[21px] leading-tight">
                      {relativeDay(match.start, comingUp.today)} · {match.bench ? "on the bench" : "starting"}
                    </span>
                    <span className="block text-xs text-lead-foreground/70">
                      {match.label} · {londonTime(match.start)}
                    </span>
                  </span>
                  <span className="font-heading text-[40px] leading-none">{match.shirt}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="your-duties" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 id="your-duties" className="font-heading text-[28px] leading-none">
            Your duties
          </h2>
          {duties.length > 0 && <span className="text-sm text-muted-foreground">{duties.length}</span>}
        </div>
        {duties.length === 0 ? (
          <p className="rounded-3xl bg-card px-5 py-6 text-sm text-muted-foreground shadow-card">
            Nothing to bring or take back. Claim one on any event.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2.5">
            {duties.map(({ duty, event, count }, i) => {
              const next = i === 0;
              const when = duty.direction === "to" ? event.start : event.end;
              const unit = allEquipment.find((k) => k.id === duty.equipmentUnitId);
              return (
                <li key={duty.id}>
                  <Link
                    href={`/events/${event.id}`}
                    className={cn(
                      "flex h-full flex-col gap-4 rounded-[20px] p-3.5 transition-transform active:scale-[0.98]",
                      next ? "bg-lead text-lead-foreground" : "bg-card shadow-card",
                    )}
                  >
                    <span className="flex items-center justify-between text-[10.5px] font-medium tracking-wide uppercase">
                      <span className={next ? "text-lead-foreground/70" : "text-muted-foreground"}>
                        {duty.direction === "to" ? "Bring" : "Take back"}
                      </span>
                      {next && (
                        <span className="size-1.5 rounded-full bg-accent">
                          <span className="sr-only">Next up</span>
                        </span>
                      )}
                    </span>
                    <span>
                      <span className="block font-heading text-[21px] leading-none">
                        {equipmentNames.get(duty.equipmentUnitId) ?? "Equipment Unit"}
                        {unit && unit.quantity > 1 && ` ×${count}`}
                      </span>
                      <span className={cn("mt-1 block truncate text-xs", next ? "text-lead-foreground/70" : "text-muted-foreground")}>
                        {relativeDay(when, comingUp.today)} · {londonTime(when)}
                      </span>
                      <span className={cn("block truncate text-xs", next ? "text-lead-foreground/70" : "text-muted-foreground")}>
                        {duty.direction === "to" ? "to" : "from"} {event.title}
                      </span>
                      {withOthers(duty.userIds) && (
                        <span className={cn("block truncate text-xs", next ? "text-lead-foreground/70" : "text-muted-foreground")}>
                          {withOthers(duty.userIds)}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ComingUp {...comingUp} canAdd={isCommitteeOrAbove(user.role)} addAction={quickAddEvent} reply={saveMyReply} seeAllHref="/events" />
    </div>
  );
}
