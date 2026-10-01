import { and, eq } from "drizzle-orm";
import { getEvent, londonParts } from "@/features/events";
import { formatDay } from "@/lib/format-time";
import { getBoard } from "./index";
import { selectionShirt, teamSheet, teamSheetDefault } from "./schema";
import {
  ROLES,
  SINGLE_ROLES,
  buildSheet,
  missingFromSheet,
  type Role,
  type SheetFields,
  type SheetLayout,
  type SheetPerson,
} from "./sheet";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type Viewer = { id: string; committee: boolean };
type Result = { ok: true } | { ok: false; error: string };

export type FieldKey = keyof SheetFields;

/** What a field says now, what it says when left alone (the Event's value or the Team's default), and whether this Match overrides it. */
export type SheetField = { value: string; base: string; overridden: boolean };

export type TeamSheet = {
  eventId: string;
  label: string;
  date: string;
  readOnly: boolean;
  /** Whether a Sheet Default can be saved: the Match has a Team. */
  hasTeam: boolean;
  fields: Record<FieldKey, SheetField>;
  people: SheetPerson[];
  layout: SheetLayout;
  missing: string[];
};

/** Fields a Team can keep a default for. The rest follow the Event or are typed per Match. */
const DEFAULTABLE = ["travelAttire", "warmUpAttire", "postMatchActivity", "message"] as const;
const isDefaultable = (key: FieldKey): key is (typeof DEFAULTABLE)[number] => (DEFAULTABLE as readonly string[]).includes(key);

/** "2.30pm", the way the club writes times on a sheet. */
function clock(instant: Date): string {
  const [h, m] = londonParts(instant).time.split(":").map(Number);
  return `${h % 12 || 12}.${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

async function sheetData(db: Db, eventId: string) {
  const event = await getEvent(db, eventId);
  if (!event || event.eventType !== "match") return null;
  const teamId = event.teams[0]?.id;
  const [[overrides], [defaults]] = await Promise.all([
    db.select().from(teamSheet).where(eq(teamSheet.eventId, eventId)),
    teamId ? db.select().from(teamSheetDefault).where(eq(teamSheetDefault.teamId, teamId)) : Promise.resolve([]),
  ]);
  return { event, teamId: teamId as string | undefined, overrides: (overrides ?? {}) as Partial<Record<FieldKey, string | null>>, defaults: (defaults ?? {}) as Partial<Record<FieldKey, string | null>> };
}

/** A Match's Team Sheet for Committee, with its fields settled and the board's people on it; null for anyone else or a non-Match. */
export async function getTeamSheet(db: Db, eventId: string, viewer: Viewer, now: Date = new Date()): Promise<TeamSheet | null> {
  if (!viewer.committee) return null;
  const [data, board] = await Promise.all([sheetData(db, eventId), getBoard(db, eventId, viewer, now)]);
  if (!data || !board) return null;
  const { event, overrides, defaults } = data;
  const pitch = board.pitches.find((p) => p.eventId === eventId)!;

  const meetBase = event.matchDetails
    ? event.matchDetails.travelMeetTime
      ? `${clock(event.matchDetails.travelMeetTime)}${event.matchDetails.travelMeetPoint ? ` at ${event.matchDetails.travelMeetPoint}` : ""}`
      : clock(event.matchDetails.meetTime)
    : "";
  const bases: Record<FieldKey, string> = {
    title: event.teams[0] && event.matchDetails ? `IMRFC ${event.teams[0].name} vs ${event.matchDetails.opponent}` : event.title,
    kickoff: clock(event.start),
    meet: meetBase,
    location: event.venue,
    schedule: "",
    travelAttire: defaults.travelAttire ?? "",
    warmUpAttire: defaults.warmUpAttire ?? "",
    postMatchActivity: defaults.postMatchActivity ?? "",
    message: defaults.message ?? "",
  };
  const fields = Object.fromEntries(
    (Object.keys(bases) as FieldKey[]).map((key) => {
      const override = overrides[key];
      const overridden = override !== null && override !== undefined;
      return [key, { value: overridden ? override : bases[key], base: bases[key], overridden }];
    }),
  ) as Record<FieldKey, SheetField>;

  const rows = await db
    .select({ shirt: selectionShirt.shirt, roles: selectionShirt.roles })
    .from(selectionShirt)
    .where(eq(selectionShirt.eventId, eventId));
  const rolesOf = new Map<number, Role[]>(rows.map((r: { shirt: number; roles: string[] }) => [r.shirt, r.roles as Role[]]));
  const people: SheetPerson[] = pitch.shirts.flatMap((s) =>
    s.occupant
      ? [
          {
            shirt: s.shirt,
            name: s.occupant.name,
            guest: s.occupant.kind === "guest",
            availability: s.occupant.kind === "player" ? s.occupant.availability : "available",
            roles: rolesOf.get(s.shirt) ?? [],
          },
        ]
      : [],
  );

  const values = Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, f.value])) as SheetFields;
  const date = formatDay(event.start);
  return {
    eventId,
    label: pitch.label,
    date,
    readOnly: pitch.readOnly,
    hasTeam: Boolean(data.teamId),
    fields,
    people,
    layout: buildSheet({ date, fields: values, shirts: people }),
    missing: missingFromSheet(people),
  };
}

export type FieldEdit = {
  value: string;
  /** Follow the Event or the default, override for this Match, or keep as the Team's new default. */
  use: "base" | "override" | "save";
};

async function refuse(db: Db, eventId: string, viewer: Viewer, now: Date): Promise<Result | null> {
  if (!viewer.committee) return { ok: false, error: "Only committee can edit the team sheet." };
  const event = await getEvent(db, eventId);
  if (!event || event.eventType !== "match") return { ok: false, error: "That match doesn't exist." };
  if (event.cancelled) return { ok: false, error: "This match is cancelled." };
  if (event.start <= now) return { ok: false, error: "This match has already started." };
  return null;
}

/** Saves edits to a Match's Team Sheet fields; a Sheet Default is saved to the Match's Team. */
export async function saveTeamSheet(
  db: Db,
  input: { eventId: string; viewer: Viewer; fields: Partial<Record<FieldKey, FieldEdit>> },
  now: Date = new Date(),
): Promise<Result> {
  const denied = await refuse(db, input.eventId, input.viewer, now);
  if (denied) return denied;
  const teamId = (await sheetData(db, input.eventId))?.teamId;

  const override: Partial<Record<FieldKey, string | null>> = {};
  const saved: Partial<Record<FieldKey, string>> = {};
  for (const [key, edit] of Object.entries(input.fields) as [FieldKey, FieldEdit][]) {
    if (edit.use === "base") override[key] = null;
    else if (edit.use === "save" && teamId && isDefaultable(key)) {
      saved[key] = edit.value;
      override[key] = null;
    } else override[key] = edit.value;
  }

  await db.transaction(async (tx: Db) => {
    if (Object.keys(saved).length && teamId) {
      await tx.insert(teamSheetDefault).values({ teamId, ...saved }).onConflictDoUpdate({ target: teamSheetDefault.teamId, set: saved });
    }
    if (Object.keys(override).length) {
      await tx.insert(teamSheet).values({ eventId: input.eventId, ...override }).onConflictDoUpdate({ target: teamSheet.eventId, set: override });
    }
  });
  return { ok: true };
}

/** Sets the Match Day Roles of whoever is on a Shirt. C and VC move off anyone else who held them. */
export async function setRoles(
  db: Db,
  input: { eventId: string; shirt: number; roles: Role[]; viewer: Viewer },
  now: Date = new Date(),
): Promise<Result> {
  const denied = await refuse(db, input.eventId, input.viewer, now);
  if (denied) return denied;
  const rows: { shirt: number; roles: string[] }[] = await db.select().from(selectionShirt).where(eq(selectionShirt.eventId, input.eventId));
  if (!rows.some((r) => r.shirt === input.shirt)) return { ok: false, error: "Pick someone for that shirt first." };

  const roles = ROLES.filter((r) => input.roles.includes(r));
  await db.transaction(async (tx: Db) => {
    for (const other of rows) {
      if (other.shirt === input.shirt) continue;
      const kept = other.roles.filter((r) => !(SINGLE_ROLES as string[]).includes(r) || !roles.includes(r as Role));
      if (kept.length !== other.roles.length) {
        await tx.update(selectionShirt).set({ roles: kept }).where(and(eq(selectionShirt.eventId, input.eventId), eq(selectionShirt.shirt, other.shirt)));
      }
    }
    await tx.update(selectionShirt).set({ roles }).where(and(eq(selectionShirt.eventId, input.eventId), eq(selectionShirt.shirt, input.shirt)));
  });
  return { ok: true };
}
