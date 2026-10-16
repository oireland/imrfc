import { LIMITS, firstTooLong } from "@/lib/text-limits";
import { formatDay } from "@/lib/day-string";

export const BODY_AREAS = [
  "Head",
  "Neck",
  "Shoulder",
  "Arm/Elbow",
  "Wrist/Hand",
  "Chest/Ribs",
  "Back",
  "Hip/Groin",
  "Thigh",
  "Knee",
  "Lower leg",
  "Ankle",
  "Foot",
] as const;
export type BodyArea = (typeof BODY_AREAS)[number];

/** Where an open Injury stands, best to worst: Playing through it, Training only, Out. */
export const OPEN_STATUSES = ["playing_through", "training_only", "out"] as const;
export type OpenStatus = (typeof OPEN_STATUSES)[number];
export type InjuryStatus = OpenStatus | "cleared";
export type Fitness = OpenStatus | "fit";

export const STATUS_LABEL: Record<InjuryStatus | "fit", string> = {
  out: "Out",
  training_only: "Training only",
  playing_through: "Playing through it",
  cleared: "Cleared",
  fit: "Fit",
};

const severity = (status: OpenStatus) => OPEN_STATUSES.indexOf(status);

/** A Player's Fitness: the worst of their open Injuries. */
export function worstFitness(statuses: OpenStatus[]): Fitness {
  return statuses.reduce<Fitness>((worst, status) => (worst === "fit" || severity(status) > severity(worst) ? status : worst), "fit");
}

/** Whether moving to `to` is a step towards Out; a brand new Injury (`from` null) always is. */
export function isWorse(from: InjuryStatus | null, to: OpenStatus): boolean {
  if (from === null || from === "cleared") return true;
  return severity(to) > severity(from);
}

export type ReportInput = {
  area: BodyArea;
  description: string;
  happenedOn: string;
  eventId: string | null;
  status: OpenStatus;
  expectedReturn: string | null;
  notSure: boolean;
  needsPhysio: boolean;
  physioNote: string;
};

export type UpdateInput = {
  status: OpenStatus;
  expectedReturn: string | null;
  notSure: boolean;
  needsPhysio: boolean;
  physioNote: string;
  note: string;
};

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** Expected Return is a visible choice: a date still to come, or Not sure yet. */
function checkReturn(input: { expectedReturn: string | null; notSure: boolean }, today: string): Checked<string | null> {
  if (input.notSure) return { ok: true, value: null };
  if (!input.expectedReturn) return { ok: false, error: "Pick when you expect to be back, or say you're not sure yet." };
  if (input.expectedReturn < today) return { ok: false, error: "Pick a day that's still to come, or say you're not sure yet." };
  return { ok: true, value: input.expectedReturn };
}

/** Needs physio only applies to Training only and Playing through it, and its note only while ticked. */
function checkPhysio(input: { status: OpenStatus; needsPhysio: boolean; physioNote: string }) {
  const needsPhysio = input.needsPhysio && input.status !== "out";
  return { needsPhysio, physioNote: needsPhysio ? input.physioNote.trim() : "" };
}

const STATUS_ERROR = "Pick whether you're playing through it, training only or out.";

export function validateReport(input: ReportInput, today: string): Checked<Omit<ReportInput, "notSure">> {
  const tooLong = firstTooLong([
    ["description", input.description, LIMITS.note],
    ["physio note", input.physioNote, LIMITS.note],
  ]);
  if (tooLong) return { ok: false, error: tooLong };
  if (!BODY_AREAS.includes(input.area)) return { ok: false, error: "Pick where it hurts." };
  if (!OPEN_STATUSES.includes(input.status)) return { ok: false, error: STATUS_ERROR };
  if (!input.happenedOn) return { ok: false, error: "Say when it happened." };
  if (input.happenedOn > today) return { ok: false, error: "That hasn't happened yet." };
  const expected = checkReturn(input, today);
  if (!expected.ok) return expected;
  return {
    ok: true,
    value: {
      area: input.area,
      description: input.description.trim(),
      happenedOn: input.happenedOn,
      eventId: input.eventId || null,
      status: input.status,
      expectedReturn: expected.value,
      ...checkPhysio(input),
    },
  };
}

export function validateUpdate(input: UpdateInput, today: string): Checked<Omit<UpdateInput, "notSure">> {
  const tooLong = firstTooLong([
    ["note", input.note, LIMITS.note],
    ["physio note", input.physioNote, LIMITS.note],
  ]);
  if (tooLong) return { ok: false, error: tooLong };
  if (!OPEN_STATUSES.includes(input.status)) return { ok: false, error: STATUS_ERROR };
  const expected = checkReturn(input, today);
  if (!expected.ok) return expected;
  return {
    ok: true,
    value: { status: input.status, expectedReturn: expected.value, note: input.note.trim(), ...checkPhysio(input) },
  };
}

/** How long an Injury with no Expected Return may stay open before Committee are prompted to check in. */
const CHECK_IN_AFTER_DAYS = 28;

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** A prompt for Committee on an open Injury that has gone quiet, or null. */
export function checkInFlag(
  injury: { status: OpenStatus; expectedReturn: string | null; happenedOn: string },
  today: string,
): string | null {
  if (injury.expectedReturn) {
    return injury.expectedReturn < today ? `Due back ${formatDay(injury.expectedReturn)}, check in` : null;
  }
  const days = daysBetween(injury.happenedOn, today);
  if (days <= CHECK_IN_AFTER_DAYS) return null;
  return `${STATUS_LABEL[injury.status]} ${Math.floor(days / 7)} weeks, check in`;
}

/** The Players list's line for a Player's open Injuries: "Out · ankle (+1)". */
export function injuryLine(injuries: { status: OpenStatus; area: BodyArea }[]): string {
  const [main, ...others] = [...injuries].sort((a, b) => severity(b.status) - severity(a.status));
  return `${STATUS_LABEL[main.status]} · ${main.area.toLowerCase()}${others.length > 0 ? ` (+${others.length})` : ""}`;
}

/** Whether Fitness means a Player isn't chased for this kind of Event: Out for both, Training only for Matches. */
export function notChasedFor(fitness: Fitness, eventType: "training" | "match"): boolean {
  return fitness === "out" || (fitness === "training_only" && eventType === "match");
}

/** The push to Committee: the name and new state only, since push shows on lock screens. */
export function statusAlert(name: string, status: OpenStatus): string {
  return `${name} is now ${STATUS_LABEL[status]}`;
}
