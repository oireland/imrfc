import { Fragment } from "react";
import Link from "next/link";
import { db } from "@/db/client";
import { ComingUp } from "@/components/coming-up";
import { CrestThemePicker } from "@/components/crest-theme-picker";
import { joinNames, listUpcomingDutiesForUser, markUnconfirmed } from "@/features/duties";
import { listKitHeldBy, listKitUnits } from "@/features/kit";
import { displayName, isCommitteeOrAbove, listApprovedUsers } from "@/features/users";
import { greeting, londonDay, londonTime } from "@/lib/calendar";
import { requireApprovedUser } from "@/lib/session";
import { cn } from "cn";
import { quickAddEvent, setTheme } from "./actions";
import { loadComingUp } from "./coming-up-data";

/** How many held Kit Units the greeting names before "& N more". */
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

  await markUnconfirmed(db);
  const [duties, held, comingUp, allKit, people] = await Promise.all([
    listUpcomingDutiesForUser(db, user.id),
    listKitHeldBy(db, user.id),
    loadComingUp(user.id),
    listKitUnits(db, { includeRetired: true }),
    listApprovedUsers(db),
  ]);
  const kitNames = new Map(allKit.map((k) => [k.id, k.name]));
  const names = new Map(people.map((p) => [p.id, displayName(p)]));
  // A shared Duty is yours for everyone on it: "with Sam".
  const withOthers = (userIds: string[]) => {
    const others = userIds.filter((id) => id !== user.id).map((id) => names.get(id) ?? "Someone");
    return others.length > 0 ? `with ${joinNames(others)}` : null;
  };
  const firstName = displayName(user).split(" ")[0];

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
                  <Link href={`/kit/${unit.id}`} className="text-foreground underline-offset-4 hover:underline">
                    {unit.name}
                    {unit.count > 1 && ` ×${unit.count}`}
                  </Link>
                </Fragment>
              ))}
              {held.length > HELD_SHOWN && (
                <>
                  {" & "}
                  <Link href="/kit" className="text-foreground underline-offset-4 hover:underline">
                    {held.length - HELD_SHOWN} more
                  </Link>
                </>
              )}
            </p>
          )}
        </div>
        <CrestThemePicker theme={user.theme} onChange={setTheme} />
      </header>

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
              const unit = allKit.find((k) => k.id === duty.kitUnitId);
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
                        {kitNames.get(duty.kitUnitId) ?? "Kit Unit"}
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

      <ComingUp {...comingUp} canAdd={isCommitteeOrAbove(user.role)} addAction={quickAddEvent} />
    </div>
  );
}
