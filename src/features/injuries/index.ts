import { and, eq, inArray, isNull } from "drizzle-orm";
import { displayName, isCommitteeOrAbove, listApprovedUsers, type Role } from "@/features/users";
import { injury, injuryChange } from "./schema";
import {
  checkInFlag,
  injuryLine,
  isWorse,
  statusAlert,
  validateReport,
  validateUpdate,
  worstFitness,
  OPEN_STATUSES,
  type InjuryStatus,
  type OpenStatus,
  type ReportInput,
  type UpdateInput,
} from "./rules";

export { BODY_AREAS, OPEN_STATUSES, STATUS_LABEL, notChasedFor, worstFitness } from "./rules";
export type { BodyArea, Fitness, InjuryStatus, OpenStatus, ReportInput, UpdateInput } from "./rules";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

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

async function alertFor(db: Db, row: Row, actorId: string, status: OpenStatus): Promise<InjuryAlert> {
  const people = await listApprovedUsers(db);
  const player = people.find((p) => p.id === row.userId);
  return {
    userIds: people
      .filter((p) => p.accessState === "approved" && isCommitteeOrAbove(p.role as Role) && p.id !== actorId)
      .map((p) => p.id)
      .sort(),
    title: statusAlert(player ? displayName(player) : "Someone", status),
    body: "",
    playerId: row.userId,
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
): Promise<{ ok: true; id: string; alert: InjuryAlert | null } | { ok: false; error: string }> {
  if (!mayManage(actor, userId)) return { ok: false, error: "Only Committee can report someone else's injury." };
  const valid = validateReport(input, today);
  if (!valid.ok) return valid;
  const fields = valid.value;
  const id = crypto.randomUUID();
  await db.insert(injury).values({ id, userId, ...fields, reportedById: actor.id, createdAt: now, updatedAt: now });
  await db.insert(injuryChange).values({
    id: crypto.randomUUID(),
    injuryId: id,
    kind: "reported",
    fromStatus: null,
    toStatus: fields.status,
    byId: actor.id,
    at: now,
  });
  const [row] = await db.select().from(injury).where(eq(injury.id, id));
  return { ok: true, id, alert: await alertFor(db, row, actor.id, fields.status) };
}

/** One Update: any open status to any other, with Expected Return, Needs physio and a progress note. */
export async function updateInjury(
  db: Db,
  actor: Actor,
  id: string,
  input: UpdateInput,
  today: string,
  now: Date = new Date(),
): Promise<{ ok: true; alert: InjuryAlert | null } | { ok: false; error: string }> {
  const row = await findOpen(db, id);
  if (!row || !mayManage(actor, row.userId)) return { ok: false, error: "You can't change that." };
  const valid = validateUpdate(input, today);
  if (!valid.ok) return valid;
  const { note, ...fields } = valid.value;
  await db.update(injury).set({ ...fields, updatedAt: now }).where(eq(injury.id, id));
  await db.insert(injuryChange).values({
    id: crypto.randomUUID(),
    injuryId: id,
    kind: "updated",
    fromStatus: row.status,
    toStatus: fields.status,
    note,
    byId: actor.id,
    at: now,
  });
  const worse = isWorse(row.status, fields.status) && row.status !== fields.status;
  return { ok: true, alert: worse ? await alertFor(db, row, actor.id, fields.status) : null };
}

/** It's over: the Injury moves to history and out of Fitness. */
export async function clearInjury(db: Db, actor: Actor, id: string, now: Date = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await findOpen(db, id);
  if (!row || !mayManage(actor, row.userId)) return { ok: false, error: "You can't change that." };
  await db.update(injury).set({ status: "cleared", clearedAt: now, updatedAt: now }).where(eq(injury.id, id));
  await db.insert(injuryChange).values({
    id: crypto.randomUUID(),
    injuryId: id,
    kind: "cleared",
    fromStatus: row.status,
    toStatus: "cleared",
    byId: actor.id,
    at: now,
  });
  return { ok: true };
}

/** Logged in error: by whoever logged it, or Committee. The Injury disappears everywhere but is kept. */
export async function logByMistake(db: Db, actor: Actor, id: string, now: Date = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const [row]: Row[] = await db.select().from(injury).where(and(eq(injury.id, id), isNull(injury.mistakeAt)));
  if (!row || !(actor.id === row.reportedById || isCommitteeOrAbove(actor.role))) return { ok: false, error: "You can't change that." };
  await db.update(injury).set({ mistakeAt: now, updatedAt: now }).where(eq(injury.id, id));
  await db.insert(injuryChange).values({
    id: crypto.randomUUID(),
    injuryId: id,
    kind: "mistake",
    fromStatus: row.status,
    toStatus: null,
    byId: actor.id,
    at: now,
  });
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

const severityRank = (status: InjuryStatus) => OPEN_STATUSES.indexOf(status as OpenStatus);

/** A Player's Injuries — only the Player and Committee can see them: open ones most urgent first, then Cleared. */
export async function listInjuries(db: Db, viewer: Actor, userId: string, today: string): Promise<{ open: InjuryView[]; history: InjuryView[] }> {
  if (!mayManage(viewer, userId)) return { open: [], history: [] };
  const rows: Row[] = await db.select().from(injury).where(and(eq(injury.userId, userId), isNull(injury.mistakeAt)));
  if (rows.length === 0) return { open: [], history: [] };
  const [changes, people]: [(typeof injuryChange.$inferSelect)[], Awaited<ReturnType<typeof listApprovedUsers>>] = await Promise.all([
    db.select().from(injuryChange).where(inArray(injuryChange.injuryId, rows.map((r) => r.id))),
    listApprovedUsers(db),
  ]);
  const names = new Map(people.map((p) => [p.id, displayName(p)]));
  const views = rows.map<InjuryView>((r) => ({
    id: r.id,
    userId: r.userId,
    area: r.area,
    description: r.description,
    happenedOn: r.happenedOn,
    eventId: r.eventId,
    status: r.status,
    expectedReturn: r.expectedReturn,
    needsPhysio: r.needsPhysio,
    physioNote: r.physioNote,
    stillExpecting: r.status !== "cleared" && !!r.expectedReturn && r.expectedReturn < today,
    checkIn: r.status === "cleared" ? null : checkInFlag({ status: r.status, expectedReturn: r.expectedReturn, happenedOn: r.happenedOn }, today),
    history: changes
      .filter((c) => c.injuryId === r.id)
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .map((c) => ({ kind: c.kind, from: c.fromStatus, to: c.toStatus, note: c.note, by: names.get(c.byId) ?? "Someone", at: c.at })),
  }));
  const open = views
    .filter((v) => v.status !== "cleared")
    .sort((a, b) => Number(b.stillExpecting) - Number(a.stillExpecting) || severityRank(b.status) - severityRank(a.status) || a.happenedOn.localeCompare(b.happenedOn));
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
export async function listFitness(db: Db, today: string): Promise<Map<string, PlayerFitness>> {
  const rows: Row[] = await db.select().from(injury).where(and(isNull(injury.mistakeAt), isNull(injury.clearedAt)));
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
          .sort((a, b) => OPEN_STATUSES.indexOf(b.status) - OPEN_STATUSES.indexOf(a.status))
          .map((r) => checkInFlag(r, today))
          .find(Boolean) ?? null,
      changedAt: new Date(Math.max(...open.map((r) => r.updatedAt.getTime()))),
    });
  }
  return fitness;
}

/** Removes a User's Injuries and their history. Not permission-checked: used by account deletion. */
export async function clearInjuries(db: Db, userId: string) {
  const rows: { id: string }[] = await db.select({ id: injury.id }).from(injury).where(eq(injury.userId, userId));
  if (rows.length === 0) return;
  await db.delete(injuryChange).where(inArray(injuryChange.injuryId, rows.map((r) => r.id)));
  await db.delete(injury).where(eq(injury.userId, userId));
}
