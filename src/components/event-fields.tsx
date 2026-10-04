"use client";

import { cn } from "cn";
import type { QuickEventInput } from "@/features/events";

export type EventType = QuickEventInput["type"];
export type HomeAway = NonNullable<QuickEventInput["homeAway"]>;
export type Competition = NonNullable<QuickEventInput["competition"]>;

export const COMPETITIONS: { key: Competition; label: string }[] = [
  { key: "bucs", label: "BUCS" },
  { key: "lusl", label: "LUSL" },
  { key: "friendly", label: "Friendly" },
  { key: "other", label: "Other" },
];

export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "rounded-full px-4 py-2 text-sm font-medium transition-colors",
        selected ? "bg-foreground text-background" : "bg-muted text-foreground hover:bg-muted/70",
      )}
    >
      {children}
    </button>
  );
}

/** A time of day that can also be TBC. An empty value is TBC; typing a time sets it, TBC clears it. */
export function TimeOrTbc({ label, value, onChange }: { label: string; value: string; onChange: (time: string) => void }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="rounded-xl bg-muted px-3 py-2 tabular-nums"
      />
      <Chip selected={value === ""} onClick={() => onChange("")}>
        TBC
      </Chip>
    </div>
  );
}

export type MatchFieldValues = {
  teamId: string;
  opponent: string;
  homeAway: HomeAway;
  kickoff: string; // HH:MM; empty is TBC
  meetTime: string; // HH:MM; empty is TBC
  travelMeetTime: string; // HH:MM; empty is TBC
  travelMeetPoint: string;
  competition: Competition;
};

/** The Match-only fields that come before the location: the Team playing, the opponent and home or away. */
export function MatchWho({
  values,
  teams,
  onChange,
}: {
  values: MatchFieldValues;
  teams: { id: string; name: string }[];
  onChange: (patch: Partial<MatchFieldValues>) => void;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-muted/60 p-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Team playing">
        {teams.map((t) => (
          <Chip key={t.id} selected={values.teamId === t.id} onClick={() => onChange({ teamId: t.id })}>
            {t.name}
          </Chip>
        ))}
      </div>
      <input
        value={values.opponent}
        onChange={(e) => onChange({ opponent: e.target.value })}
        placeholder="Opponent"
        aria-label="Opponent"
        required
        className="rounded-xl bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Home or away">
        <Chip selected={values.homeAway === "home"} onClick={() => onChange({ homeAway: "home" })}>
          Home
        </Chip>
        <Chip selected={values.homeAway === "away"} onClick={() => onChange({ homeAway: "away" })}>
          Away
        </Chip>
      </div>
    </div>
  );
}

/** The Match's three times, each of which can be TBC, with where to meet to travel and the competition. */
export function MatchWhen({ values, onChange }: { values: MatchFieldValues; onChange: (patch: Partial<MatchFieldValues>) => void }) {
  return (
    <div className="mb-4 flex flex-col gap-3">
      <TimeOrTbc label="Kick-off" value={values.kickoff} onChange={(kickoff) => onChange({ kickoff })} />
      <TimeOrTbc label="Meet time at venue" value={values.meetTime} onChange={(meetTime) => onChange({ meetTime })} />
      <TimeOrTbc label="Transport meet time" value={values.travelMeetTime} onChange={(travelMeetTime) => onChange({ travelMeetTime })} />
      <input
        value={values.travelMeetPoint}
        onChange={(e) => onChange({ travelMeetPoint: e.target.value })}
        placeholder="Transport meet point"
        aria-label="Transport meet point"
        className="rounded-xl bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Competition">
        {COMPETITIONS.map((c) => (
          <Chip key={c.key} selected={values.competition === c.key} onClick={() => onChange({ competition: c.key })}>
            {c.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/** The Match fields as the action takes them: TBC (empty) times left out, kick-off TBC flagged. */
export function matchInput(values: MatchFieldValues): Pick<
  QuickEventInput,
  "teamId" | "opponent" | "homeAway" | "competition" | "startTime" | "kickoffTbc" | "meetTime" | "travelMeetTime" | "travelMeetPoint"
> {
  return {
    teamId: values.teamId,
    opponent: values.opponent,
    homeAway: values.homeAway,
    competition: values.competition,
    startTime: values.kickoff || "00:00",
    kickoffTbc: values.kickoff === "",
    meetTime: values.meetTime || undefined,
    travelMeetTime: values.travelMeetTime || undefined,
    travelMeetPoint: values.travelMeetPoint,
  };
}
