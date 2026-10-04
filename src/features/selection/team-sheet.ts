import { and, eq } from "drizzle-orm";
import { getEvent, londonParts } from "@/features/events";
import { formatDay } from "@/lib/format-time";
import { getBoard } from "./index";
import { selectionShirt } from "./schema";
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

export type TeamSheet = {
  eventId: string;
  label: string;
  date: string;
  readOnly: boolean;
  layout: SheetLayout;
  missing: string[];
};

/** "2.30pm", the way the club writes times on a sheet. */
function clock(instant: Date): string {
  const [h, m] = londonParts(instant).time.split(":").map(Number);
  return `${h % 12 || 12}.${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

/** The Match's times that are still TBC. Transport only matters for an away Match. */
function missingTimes(event: NonNullable<Awaited<ReturnType<typeof getEvent>>>): string[] {
  const details = event.matchDetails;
  const missing: string[] = [];
  if (event.startTbc) missing.push("Kick-off time is TBC");
  if (details && !details.meetTime) missing.push("Meet time is TBC");
  if (details?.homeAway === "away" && !details.travelMeetTime) missing.push("Transport meet time is TBC");
  return missing;
}

/** A Match's Team Sheet fields, read from the Event and its match details; null for a non-Match. */
export async function settleFields(db: Db, eventId: string) {
  const event = await getEvent(db, eventId);
  if (!event || event.eventType !== "match") return null;
  const details = event.matchDetails;

  const meet = !details
    ? ""
    : details.travelMeetTime
      ? `${clock(details.travelMeetTime)}${details.travelMeetPoint ? ` at ${details.travelMeetPoint}` : ""}`
      : details.meetTime
        ? clock(details.meetTime)
        : "TBC";
  const fields: SheetFields = {
    title: `IMRFC ${event.title}`,
    kickoff: event.startTbc ? "TBC" : clock(event.start),
    meet,
    location: event.venue,
    schedule: details?.schedule ?? "",
    travelAttire: details?.travelAttire ?? "",
    warmUpAttire: details?.warmUpAttire ?? "",
    postMatchActivity: details?.postMatchActivity ?? "",
  };
  return { event, fields };
}

/** A Match's Team Sheet for Committee, drawn from the Event and the board; null for anyone else or a non-Match. */
export async function getTeamSheet(db: Db, eventId: string, viewer: Viewer, now: Date = new Date()): Promise<TeamSheet | null> {
  if (!viewer.committee) return null;
  const [settled, board] = await Promise.all([settleFields(db, eventId), getBoard(db, eventId, viewer, now)]);
  if (!settled || !board) return null;
  const { event, fields } = settled;
  const pitch = board.pitches.find((p) => p.eventId === eventId)!;

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

  const date = formatDay(event.start);
  return {
    eventId,
    label: pitch.label,
    date,
    readOnly: pitch.readOnly,
    layout: buildSheet({ date, fields, shirts: people }),
    missing: [...missingTimes(event), ...missingFromSheet(people)],
  };
}

async function refuse(db: Db, eventId: string, viewer: Viewer, now: Date): Promise<Result | null> {
  if (!viewer.committee) return { ok: false, error: "Only committee can change the team." };
  const event = await getEvent(db, eventId);
  if (!event || event.eventType !== "match") return { ok: false, error: "That match doesn't exist." };
  if (event.cancelled) return { ok: false, error: "This match is cancelled." };
  if (event.start <= now) return { ok: false, error: "This match has already started." };
  return null;
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
