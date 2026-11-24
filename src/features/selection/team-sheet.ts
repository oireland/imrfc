import type { Db } from "@/db/types";
import { and, eq } from "drizzle-orm";
import { getEvent, type EventWithDetails } from "@/features/events";
import { formatDay } from "@/lib/time/format-time";
import { refuseMatchChange } from "./guard";
import { getBoard, type Board } from "./index";
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
import { londonParts } from "@/lib/time/london";
import type { Result } from "@/lib/result";

type Viewer = { id: string; committee: boolean };

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
function missingTimes(event: EventWithDetails): string[] {
  const details = event.matchDetails;
  const missing: string[] = [];
  if (event.startTbc) missing.push("Kick-off time is TBC");
  if (details && !details.meetTime) missing.push("Meet time is TBC");
  if (details?.homeAway === "away" && !details.travelMeetTime) missing.push("Transport meet time is TBC");
  return missing;
}

/** A Match's Team Sheet fields, read from the Event and its match details; null for a non-Match. */
export async function sheetFieldsFor(db: Db, eventId: string) {
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
export async function getTeamSheet(
  db: Db,
  eventId: string,
  viewer: Viewer,
  now: Date = new Date(),
  /** The match day's board, when the caller has already loaded it; saves loading it again. */
  loaded?: Board,
): Promise<TeamSheet | null> {
  if (!viewer.committee) return null;
  const [settled, board] = await Promise.all([sheetFieldsFor(db, eventId), loaded ?? getBoard(db, eventId, viewer, now)]);
  if (!settled || !board) return null;
  const { event, fields } = settled;
  const pitch = board.pitches.find((p) => p.eventId === eventId)!;

  const people: SheetPerson[] = pitch.shirts.flatMap((s) =>
    s.occupant
      ? [
          {
            shirt: s.shirt,
            name: s.occupant.name,
            guest: s.occupant.kind === "guest",
            availability: s.occupant.kind === "player" ? s.occupant.availability : "available",
            roles: s.roles,
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

const refuse = (db: Db, eventId: string, viewer: Viewer, now: Date) =>
  refuseMatchChange(db, eventId, viewer, now, "Only committee can change the team.");

/** Sets the Match Day Roles of whoever is on a Shirt. C and VC move off anyone else who held them. */
export async function setRoles(
  db: Db,
  input: { eventId: string; shirt: number; roles: Role[]; viewer: Viewer },
  now: Date = new Date(),
): Promise<Result> {
  const denied = await refuse(db, input.eventId, input.viewer, now);
  if (denied) return denied;
  const rows = await db.select().from(selectionShirt).where(eq(selectionShirt.eventId, input.eventId));
  if (!rows.some((r) => r.shirt === input.shirt)) return { ok: false, error: "Pick someone for that shirt first." };

  const roles = ROLES.filter((r) => input.roles.includes(r));
  await db.transaction(async (tx) => {
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
