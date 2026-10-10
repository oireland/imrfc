"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { BottomSheet, SheetSaveButton } from "@/components/bottom-sheet";
import { Chip } from "@/components/event-fields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { BODY_AREAS, type BodyArea, type OpenStatus, type ReportInput, type UpdateInput } from "@/features/injuries/rules";
import { cn } from "cn";

type Result = { ok: true } | { ok: false; error: string };

export type InjuryActions = {
  report: (input: ReportInput) => Promise<Result>;
  update: (id: string, input: UpdateInput) => Promise<Result>;
  clear: (id: string) => Promise<Result>;
  mistake: (id: string) => Promise<Result>;
};

const STATUSES: { key: OpenStatus; label: string; hint: string }[] = [
  { key: "out", label: "Out", hint: "Can't train or play" },
  { key: "training_only", label: "Training only", hint: "Can train, can't play Matches" },
  { key: "playing_through", label: "Playing through it", hint: "Can play, still carrying it" },
];

function StatusPicker({ value, onChange }: { value: OpenStatus; onChange: (status: OpenStatus) => void }) {
  return (
    <div role="group" aria-label="Can you still play?" className="grid gap-1.5">
      {STATUSES.map((s) => (
        <button
          key={s.key}
          type="button"
          aria-pressed={value === s.key}
          onClick={() => onChange(s.key)}
          className={cn(
            "flex flex-col rounded-2xl border px-3.5 py-2.5 text-left text-sm font-semibold",
            value === s.key ? "border-foreground shadow-[inset_0_0_0_1px_var(--foreground)]" : "border-border",
          )}
        >
          {s.label}
          <span className="text-xs font-normal text-muted-foreground">{s.hint}</span>
        </button>
      ))}
    </div>
  );
}

/** Expected Return with a visible Not sure yet, so skipping is a choice. */
function ExpectedReturn({
  date,
  notSure,
  onDate,
  onNotSure,
  label,
}: {
  date: string;
  notSure: boolean;
  onDate: (date: string) => void;
  onNotSure: (notSure: boolean) => void;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="injury-back">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id="injury-back"
          type="date"
          value={notSure ? "" : date}
          disabled={notSure}
          onChange={(e) => onDate(e.target.value)}
        />
        <Chip selected={notSure} onClick={() => onNotSure(!notSure)}>
          Not sure yet
        </Chip>
      </div>
    </div>
  );
}

function PhysioFields({
  status,
  needsPhysio,
  note,
  onNeeds,
  onNote,
}: {
  status: OpenStatus;
  needsPhysio: boolean;
  note: string;
  onNeeds: (needs: boolean) => void;
  onNote: (note: string) => void;
}) {
  if (status === "out") return null;
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-3 text-sm font-semibold">
        <input type="checkbox" checked={needsPhysio} onChange={(e) => onNeeds(e.target.checked)} className="size-5 accent-primary" />
        I&apos;d like the physio&apos;s help at games
      </label>
      {needsPhysio && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="injury-physio">What do you need?</Label>
          <Input id="injury-physio" value={note} placeholder="Strapping on the left leg" onChange={(e) => onNote(e.target.value)} />
        </div>
      )}
    </div>
  );
}

export type EventOption = { id: string; label: string };

/** "What happened?": reports an Injury. `today` is the London date, for the default and its limit. */
export function ReportInjurySheet({
  today,
  events,
  save,
  onClose,
  onSaved,
}: {
  today: string;
  events: EventOption[];
  save: (input: ReportInput) => Promise<Result>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [area, setArea] = useState<BodyArea | "">("");
  const [description, setDescription] = useState("");
  const [happenedOn, setHappenedOn] = useState(today);
  const [eventId, setEventId] = useState("");
  const [status, setStatus] = useState<OpenStatus>("out");
  const [expectedReturn, setExpectedReturn] = useState("");
  const [notSure, setNotSure] = useState(false);
  const [needsPhysio, setNeedsPhysio] = useState(false);
  const [physioNote, setPhysioNote] = useState("");

  return (
    <BottomSheet
      eyebrow="Report an injury"
      title="What happened?"
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await save({
            area: area as BodyArea,
            description,
            happenedOn,
            eventId: eventId || null,
            status,
            expectedReturn: expectedReturn || null,
            notSure,
            needsPhysio,
            physioNote,
          });
          if (result.ok) onSaved();
          else toast.error(result.error);
        });
      }}
    >
      <div className="flex flex-col gap-4 pb-2">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Where does it hurt</p>
          <div role="group" aria-label="Where does it hurt" className="flex flex-wrap gap-1.5">
            {BODY_AREAS.map((a) => (
              <Chip key={a} selected={area === a} onClick={() => setArea(a)}>
                {a}
              </Chip>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="injury-description">What did you do to it?</Label>
          <Input id="injury-description" value={description} placeholder="Pulled it sprinting" onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="injury-when">Happened</Label>
            <Input id="injury-when" type="date" value={happenedOn} max={today} onChange={(e) => setHappenedOn(e.target.value)} />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="injury-event">At</Label>
            <NativeSelect id="injury-event" className="w-full" value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <NativeSelectOption value="">Not at an event</NativeSelectOption>
              {events.map((ev) => (
                <NativeSelectOption key={ev.id} value={ev.id}>
                  {ev.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Can you still play?</p>
          <StatusPicker value={status} onChange={setStatus} />
        </div>
        <ExpectedReturn
          label="When do you expect to be back?"
          date={expectedReturn}
          notSure={notSure}
          onDate={setExpectedReturn}
          onNotSure={setNotSure}
        />
        <PhysioFields status={status} needsPhysio={needsPhysio} note={physioNote} onNeeds={setNeedsPhysio} onNote={setPhysioNote} />
        <SheetSaveButton pending={pending} />
      </div>
    </BottomSheet>
  );
}

export type UpdatableInjury = {
  id: string;
  area: string;
  /** "Since 21 Sep". */
  since: string;
  status: OpenStatus;
  expectedReturn: string | null;
  /** The Expected Return has passed, so the sheet starts empty and asks for a fresh answer. */
  expectedPassed: boolean;
  needsPhysio: boolean;
  physioNote: string;
};

/** The one Update sheet: any status to any other, Expected Return, Needs physio and a progress note. */
export function UpdateInjurySheet({
  injury,
  actions,
  onClose,
  onSaved,
}: {
  injury: UpdatableInjury;
  actions: Pick<InjuryActions, "update" | "clear" | "mistake">;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<OpenStatus>(injury.status);
  const [expectedReturn, setExpectedReturn] = useState(injury.expectedPassed ? "" : (injury.expectedReturn ?? ""));
  const [notSure, setNotSure] = useState(!injury.expectedPassed && injury.expectedReturn === null);
  const [needsPhysio, setNeedsPhysio] = useState(injury.needsPhysio);
  const [physioNote, setPhysioNote] = useState(injury.physioNote);
  const [note, setNote] = useState("");
  const [confirmingMistake, setConfirmingMistake] = useState(false);

  function run(task: () => Promise<Result>, done: string) {
    startTransition(async () => {
      const result = await task();
      if (result.ok) onSaved(done);
      else toast.error(result.error);
    });
  }

  return (
    <BottomSheet
      eyebrow={`Update · ${injury.since}`}
      title={injury.area}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => actions.update(injury.id, { status, expectedReturn: expectedReturn || null, notSure, needsPhysio, physioNote, note }),
          "Update saved",
        );
      }}
    >
      <div className="flex flex-col gap-4 pb-2">
        <StatusPicker value={status} onChange={setStatus} />
        <ExpectedReturn label="Expected back" date={expectedReturn} notSure={notSure} onDate={setExpectedReturn} onNotSure={setNotSure} />
        <PhysioFields status={status} needsPhysio={needsPhysio} note={physioNote} onNeeds={setNeedsPhysio} onNote={setPhysioNote} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="injury-note">Progress note (shown in the history)</Label>
          <Input id="injury-note" value={note} placeholder="Jogged 5k without pain" onChange={(e) => setNote(e.target.value)} />
        </div>
        <SheetSaveButton pending={pending} />
        <div className="flex items-center justify-between border-t border-border pt-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => actions.clear(injury.id), "Cleared")}
            className="px-1 py-2 text-sm font-semibold text-destructive-text"
          >
            It&apos;s cleared
          </button>
          {confirmingMistake ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => actions.mistake(injury.id), "Removed")}
              className="px-1 py-2 text-sm font-semibold text-destructive-text"
            >
              Yes, it was a mistake
            </button>
          ) : (
            <button type="button" onClick={() => setConfirmingMistake(true)} className="px-1 py-2 text-sm font-semibold text-muted-foreground">
              Logged by mistake
            </button>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
