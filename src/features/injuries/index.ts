import type { Db } from "@/db/types";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { isCommitteeOrAbove, listCommitteeIds, loadNames, type Role } from "@/features/users";
import { injury, injuryChange } from "./schema";
import type { PhysioNeed } from "./physio-list-rules";
import {
  checkInFlag,
  injuryAppliesOn,
  injuryLine,
  isWorse,
  statusAlert,
  validateReport,
  validateUpdate,
  worstFitness,
  severity,
  type InjuryStatus,
  type OpenStatus,
  type ReportInput,
  type UpdateInput,
} from "./rules";
import type { Result } from "@/lib/result";

export { BODY_AREAS, OPEN_STATUSES, STATUS_LABEL, notChasedFor, worstFitness, injuryAppliesOn } from "./rules";
export { formatPhysioList } from "./physio-list-rules";
export type { PhysioNeed } from "./physio-list-rules";
export type { BodyArea, Fitness, InjuryStatus, OpenStatus, ReportInput, UpdateInput } from "./rules";


type Actor = { id: string; role: Role };
type Row = typeof injury.$inferSelect;

/** Who in Committee to push about a new or worse Injury, and what to say. */
export type InjuryAlert = { userIds: string[]; title: string; body: string; playerId: string };

/** A Player manages their own Injuries; Committee can for anyone. */
const mayManage = (actor: Actor, userId: string) => actor.id === userId || isCommitteeOrAbove(actor.role);

async function findOpen(db: Db, id: string): Promise<Row | undefined> {
  const [row] = await db.select().from(injury).where(and(eq(injury.id, id), isNull(injury.mistakeAt), isNull(injury.clearedAt)));
  return row;
}

type ChangeKind = (typeof injuryChange.$inferInsert)["kind"];

async function logChange(
  db: Db,
  injuryId: string,
  kind: ChangeKind,
  from: InjuryStatus | null,
  to: InjuryStatus | null,
  byId: string,
  at: Date,
  note?: string,
) {
  await db.insert(injuryChange).values({ id: crypto.randomUUID(), injuryId, kind, fromStatus: from, toStatus: to, note, byId, at });
}

async function alertFor(db: Db, userId: string, actorId: string, status: OpenStatus): Promise<InjuryAlert> {
  const name = await loadNames(db);
  return {
    userIds: await listCommitteeIds(db, { except: actorId }),
    title: statusAlert(name(userId), status),
    body: "",
    playerId: userId,
  };
}

/** Reports an Injury for `userId` (themself, or anyone for Committee). */
export async function reportInjury(
  db: Db,
  actor: Actor,
  userId: string,
  input: ReportInput,
  today: string,
  now: Date = new Date(),
): Promise<Result<{ id: string; alert: InjuryAlert | null }>> {
  if (!mayManage(actor, userId)) return { ok: false, error: "Only Committee can report someone else's injury." };
  const valid = validateReport(input, today);
  if (!valid.ok) return valid;
  const fields = valid.value;
  const id = crypto.randomUUID();
  await db.insert(injury).values({ id, userId, ...fields, reportedById: actor.id, createdAt: now, updatedAt: now });
  await logChange(db, id, "reported", null, fields.status, actor.id, now);
  return { ok: true, id, alert: await alertFor(db, userId, actor.id, fields.status) };
}

/** One Update: any open status to any other, with Expected Return, Needs physio and a progress note. */
export async function updateInjury(
  db: Db,
  actor: Actor,
  id: string,
  input: UpdateInput,
  today: string,
  now: Date = new Date(),
): Promise<Result<{ alert: InjuryAlert | null }>> {
  const row = await findOpen(db, id);
  if (!row || !mayManage(actor, row.userId)) return { ok: false, error: "You can't change that." };
  const valid = validateUpdate(input, today);
  if (!valid.ok) return valid;
  const { note, ...fields } = valid.value;
  await db.update(injury).set({ ...fields, updatedAt: now }).where(eq(injury.id, id));
  await logChange(db, id, "updated", row.status, fields.status, actor.id, now, note);
  const worse = isWorse(row.status, fields.status);
  return { ok: true, alert: worse ? await alertFor(db, row.userId, actor.id, fields.status) : null };
}

/** It's over: the Injury moves to history and out of Fitness. */
export async function clearInjury(db: Db, actor: Actor, id: string, now: Date = new Date()): Promise<Result> {
  const row = await findOpen(db, id);
  if (!row || !mayManage(actor, row.userId)) return { ok: false, error: "You can't change that." };
  await db.update(injury).set({ status: "cleared", clearedAt: now, updatedAt: now }).where(eq(injury.id, id));
  await logChange(db, id, "cleared", row.status, "cleared", actor.id, now);
  return { ok: true };
}

/** Logged in error: by whoever logged it, or Committee. The Injury disappears everywhere but is kept. */
export async function logByMistake(db: Db, actor: Actor, id: string, now: Date = new Date()): Promise<Result> {
  const [row] = await db.select().from(injury).where(and(eq(injury.id, id), isNull(injury.mistakeAt)));
  if (!row || !(actor.id === row.reportedById || isCommitteeOrAbove(actor.role))) return { ok: false, error: "You can't change that." };
  await db.update(injury).set({ mistakeAt: now, updatedAt: now }).where(eq(injury.id, id));
  await logChange(db, id, "mistake", row.status, null, actor.id, now);
  return { ok: true };
}

export type InjuryChange = {
  kind: "reported" | "updated" | "cleared" | "mistake";
  from: InjuryStatus | null;
  to: InjuryStatus | null;
  note: string;
  by: string;
  at: Date;
};

export type InjuryView = {
  id: string;
  userId: string;
  area: Row["area"];
  description: string;
  happenedOn: string;
  eventId: string | null;
  status: InjuryStatus;
  expectedReturn: string | null;
  needsPhysio: boolean;
  physioNote: string;
  /** An Expected Return that has passed: Home asks "Still expecting…?". */
  stillExpecting: boolean;
  /** For Committee: a prompt to check in on a quiet Injury. */
  checkIn: string | null;
  history: InjuryChange[];
};

/** A Player's Injuries — only the Player and Committee can see them: open ones most urgent first, then Cleared. */
export async function listInjuries(db: Db, viewer: Actor, userId: string, today: string): Promise<{ open: InjuryView[]; history: InjuryView[] }> {
  if (!mayManage(viewer, userId)) return { open: [], history: [] };
  const rows = await db.select().from(injury).where(and(eq(injury.userId, userId), isNull(injury.mistakeAt)));
  if (rows.length === 0) return { open: [], history: [] };
  const [changes, name]: [(typeof injuryChange.$inferSelect)[], (id: string) => string] = await Promise.all([
    db.select().from(injuryChange).where(inArray(injuryChange.injuryId, rows.map((r) => r.id))),
    loadNames(db),
  ]);
  // The row has columns the view must not carry (Cleared/mistake stamps, audit fields): destructure them out.
  const views = rows.map<InjuryView>(({ reportedById, createdAt, updatedAt, clearedAt, mistakeAt, ...r }) => ({
    ...r,
    stillExpecting: r.status !== "cleared" && !!r.expectedReturn && r.expectedReturn < today,
    checkIn: r.status === "cleared" ? null : checkInFlag({ status: r.status, expectedReturn: r.expectedReturn, happenedOn: r.happenedOn }, today),
    history: changes
      .filter((c) => c.injuryId === r.id)
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .map((c) => ({ kind: c.kind, from: c.fromStatus, to: c.toStatus, note: c.note, by: name(c.byId), at: c.at })),
  }));
  const open = views
    .filter((v) => v.status !== "cleared")
    .sort((a, b) => Number(b.stillExpecting) - Number(a.stillExpecting) || severity(b.status) - severity(a.status) || a.happenedOn.localeCompare(b.happenedOn));
  const history = views.filter((v) => v.status === "cleared").sort((a, b) => b.happenedOn.localeCompare(a.happenedOn));
  return { open, history };
}

export type PlayerFitness = {
  fitness: OpenStatus;
  /** "Out · ankle (+1)". */
  line: string;
  /** The main Injury's body area, for Committee's eyes. */
  detail: string;
  checkIn: string | null;
  /** When an open Injury last changed, for the New dot. */
  changedAt: Date;
};

/**
 * Every Player with an open Injury, by user id: Fitness (the worst open Injury), the Players list's line and
 * check-in flag. Players who are Fit have no entry. For Committee screens and the availability feature.
 */
export async function listFitness(db: Db, today: string, onDate: string = today): Promise<Map<string, PlayerFitness>> {
  const all = await db.select().from(injury).where(and(isNull(injury.mistakeAt), isNull(injury.clearedAt)));
  // Fitness on `onDate`: Injuries that haven't started yet, or that will be over by then, don't count.
  const rows = all.filter((r) => injuryAppliesOn(r, onDate, today));
  const byUser = Map.groupBy(rows, (r) => r.userId);
  const fitness = new Map<string, PlayerFitness>();
  for (const [userId, injuries] of byUser) {
    const open = injuries.map((r) => ({ ...r, status: r.status as OpenStatus }));
    const worst = worstFitness(open.map((r) => r.status)) as OpenStatus;
    const main = open.filter((r) => r.status === worst).sort((a, b) => a.happenedOn.localeCompare(b.happenedOn))[0];
    fitness.set(userId, {
      fitness: worst,
      line: injuryLine(open),
      detail: main.area,
      checkIn:
        [...open]
          .sort((a, b) => severity(b.status) - severity(a.status))
          .map((r) => checkInFlag(r, today))
          .find(Boolean) ?? null,
      changedAt: new Date(Math.max(...open.map((r) => r.updatedAt.getTime()))),
    });
  }
  return fitness;
}

/**
 * Who needs the physio: open Injuries with Needs physio ticked (Out never counts). `userIds` narrows it to some
 * Players (a Match's team); leave it out for the whole club. Committee only, which the caller checks.
 */
export async function listPhysioNeeds(db: Db, userIds?: string[]): Promise<PhysioNeed[]> {
  if (userIds && userIds.length === 0) return [];
  const rows = await db
    .select()
    .from(injury)
    .where(
      and(
        isNull(injury.mistakeAt),
        isNull(injury.clearedAt),
        eq(injury.needsPhysio, true),
        ne(injury.status, "out"),
        userIds ? inArray(injury.userId, userIds) : undefined,
      ),
    );
  if (rows.length === 0) return [];
  const name = await loadNames(db);
  return rows.map((r) => ({ name: name(r.userId), area: r.area, physioNote: r.physioNote }));
}

/** Removes a User's Injuries and their history. Not permission-checked: used by account deletion. */
export async function clearInjuries(db: Db, userId: string) {
  const rows = await db.select({ id: injury.id }).from(injury).where(eq(injury.userId, userId));
  if (rows.length === 0) return;
  await db.delete(injuryChange).where(inArray(injuryChange.injuryId, rows.map((r) => r.id)));
  await db.delete(injury).where(eq(injury.userId, userId));
}
