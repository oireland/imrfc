import { and, eq, inArray, isNull } from "drizzle-orm";
import { listDutyRecordForUser } from "@/features/duties";
import { displayName, isCommitteeOrAbove, listKnownUsers, RUGBY_POSITIONS, setPlaying, setPositions, type Role, type RugbyPosition } from "@/features/users";
import {
  awayLabel,
  awayPushMessage,
  groupAway,
  imBackUntil,
  londonToday,
  periodState,
  validateAway,
  type AwayInput,
  type AwayPeriod,
} from "./away-rules";
import { listPlayers as listPlayersRules, summarizePlayers, type PlayerListing, type PlayerRow } from "./list-rules";
import { normalizePositions } from "./positions-rules";
import { playerAway } from "./schema";

export { setPlaying, setPositions };
export { normalizePositions } from "./positions-rules";
export type { PlayerListing, PlayerRow } from "./list-rules";
export { summarizePlayers };
export { addDays, awayLabel, formatDay, londonToday, periodState, rangeLabel } from "./away-rules";
export type { AwayInput, AwayPeriod, AwayState } from "./away-rules";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type Player = {
  id: string;
  name: string;
  preferredPosition: RugbyPosition | null;
  otherPositions: RugbyPosition[];
  playing: boolean;
};

/** How long an Injury or Away change keeps its New dot on the Players list. */
const NEW_FOR_MS = 48 * 3_600_000;

/** What the Players list needs to know of a Player's Injuries; the `injuries` feature supplies it. */
export type PlayerHealth = {
  fitness: "out" | "training_only" | "playing_through";
  line: string;
  checkIn: string | null;
  changedAt: Date;
};

// Deleted accounts stay in the Users table so history can name them, but aren't Players.
async function listPlayerUsers(db: Db) {
  return (await listKnownUsers(db)).filter((u) => u.accessState !== "deleted");
}

/** Every approved User as a Player, Position-ordered and split into Playing / Not playing. */
export async function listPlayers(
  db: Db,
  search = "",
  {
    today = londonToday(),
    now = new Date(),
    fitness = new Map(),
    ...filters
  }: {
    today?: string;
    now?: Date;
    /** Fitness by user id, from the `injuries` feature; Players missing from it are Fit. */
    fitness?: Map<string, PlayerHealth>;
    awayOnly?: boolean;
    injuredOnly?: boolean;
  } = {},
): Promise<PlayerListing & { summary: string }> {
  const [users, periods] = await Promise.all([listPlayerUsers(db), activeAway(db)]);
  const awayByUser = Map.groupBy(periods, (p) => p.userId);
  const recent = new Date(now.getTime() - NEW_FOR_MS);
  const rows: PlayerRow[] = users.map((u) => {
    const mine = awayByUser.get(u.id) ?? [];
    const health = fitness.get(u.id);
    return {
      id: u.id,
      name: displayName(u),
      preferredPosition: u.preferredPosition as RugbyPosition | null,
      playing: u.playing,
      away: groupAway(mine, today).current.length > 0,
      awayLabel: awayLabel(mine, today),
      fitness: health?.fitness ?? null,
      injuryLine: health?.line ?? null,
      checkIn: health?.checkIn ?? null,
      isNew: mine.some((p) => p.updatedAt > recent) || (!!health && health.changedAt > recent),
    };
  });
  return { ...listPlayersRules(rows, search, filters), summary: summarizePlayers(rows) };
}

/** One Player, with their Positions and duty record, for the Player page. */
export async function getPlayer(db: Db, id: string): Promise<(Player & { dutyRecord: Awaited<ReturnType<typeof listDutyRecordForUser>> }) | undefined> {
  const users = await listPlayerUsers(db);
  const found = users.find((u) => u.id === id);
  if (!found) return undefined;
  const dutyRecord = await listDutyRecordForUser(db, id);
  return {
    id: found.id,
    name: displayName(found),
    preferredPosition: found.preferredPosition as RugbyPosition | null,
    otherPositions: found.otherPositions as RugbyPosition[],
    playing: found.playing,
    dutyRecord,
  };
}

/** Sets a Player's Positions, deduplicated and never repeating the Preferred one. */
export async function setPlayerPositions(
  db: Db,
  userId: string,
  preferred: RugbyPosition,
  other: RugbyPosition[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const valid = (p: unknown) => (RUGBY_POSITIONS as readonly unknown[]).includes(p);
  if (!valid(preferred) || !other.every(valid)) return { ok: false, error: "Pick positions from the list." };
  await setPositions(db, userId, normalizePositions(preferred, other));
  return { ok: true };
}

// ---- Time away ----------------------------------------------------------------------------

type Actor = { id: string; role: Role };
type AwayResult = { ok: true } | { ok: false; error: string };

/** A Player manages their own time Away; Committee can for anyone. */
const mayManage = (actor: Actor, userId: string) => actor.id === userId || isCommitteeOrAbove(actor.role);

async function activeAway(db: Db): Promise<(typeof playerAway.$inferSelect)[]> {
  return db.select().from(playerAway).where(isNull(playerAway.removedAt));
}

async function findAway(db: Db, id: string): Promise<(typeof playerAway.$inferSelect) | undefined> {
  const [row] = await db.select().from(playerAway).where(and(eq(playerAway.id, id), isNull(playerAway.removedAt)));
  return row;
}

const toPeriod = (row: typeof playerAway.$inferSelect): AwayPeriod => ({
  id: row.id,
  userId: row.userId,
  from: row.from,
  until: row.until,
  reason: row.reason,
  setById: row.setById,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** Adds a period of time Away for `userId` (themself, or anyone for Committee). */
export async function addAway(
  db: Db,
  actor: Actor,
  userId: string,
  input: AwayInput,
  today = londonToday(),
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!mayManage(actor, userId)) return { ok: false, error: "Only Committee can set someone else's time away." };
  const valid = validateAway(input, today);
  if (!valid.ok) return valid;
  const id = crypto.randomUUID();
  await db.insert(playerAway).values({ id, userId, ...valid.value, setById: actor.id });
  return { ok: true, id };
}

/** Changes a period that hasn't finished. */
export async function editAway(db: Db, actor: Actor, id: string, input: AwayInput, today = londonToday()): Promise<AwayResult> {
  const row = await findAway(db, id);
  if (!row || !mayManage(actor, row.userId)) return { ok: false, error: "You can't change that." };
  if (periodState(row, today) === "past") return { ok: false, error: "That one is over, so it stays as it was." };
  const valid = validateAway(input, today);
  if (!valid.ok) return valid;
  await db.update(playerAway).set({ ...valid.value, updatedAt: new Date() }).where(eq(playerAway.id, id));
  return { ok: true };
}

/** I'm back: ends a current period yesterday, or drops one that only starts today. */
export async function imBack(db: Db, actor: Actor, id: string, today = londonToday()): Promise<AwayResult> {
  const row = await findAway(db, id);
  if (!row || !mayManage(actor, row.userId)) return { ok: false, error: "You can't change that." };
  if (periodState(row, today) !== "current") return { ok: false, error: "That isn't running now." };
  if (row.from >= today) return removeAway(db, actor, id, today);
  await db.update(playerAway).set({ until: imBackUntil(today), updatedAt: new Date() }).where(eq(playerAway.id, id));
  return { ok: true };
}

/** Removes one still to come or running (added by mistake). Past periods stay as history. */
export async function removeAway(db: Db, actor: Actor, id: string, today = londonToday()): Promise<AwayResult> {
  const row = await findAway(db, id);
  if (!row || !mayManage(actor, row.userId)) return { ok: false, error: "You can't change that." };
  if (periodState(row, today) === "past") return { ok: false, error: "Past time away is kept as history." };
  await db.update(playerAway).set({ removedAt: new Date() }).where(eq(playerAway.id, id));
  return { ok: true };
}

export type AwayListing = { current: AwayEntry[]; future: AwayEntry[]; past: AwayEntry[] };
export type AwayEntry = AwayPeriod & { setBy: string };

/** A Player's time Away, grouped; only the Player themself and Committee can see it. */
export async function listAway(db: Db, viewer: Actor, userId: string, today = londonToday()): Promise<AwayListing> {
  if (!mayManage(viewer, userId)) return { current: [], future: [], past: [] };
  const [rows, people]: [(typeof playerAway.$inferSelect)[], Awaited<ReturnType<typeof listKnownUsers>>] = await Promise.all([
    db.select().from(playerAway).where(and(eq(playerAway.userId, userId), isNull(playerAway.removedAt))),
    listKnownUsers(db),
  ]);
  const names = new Map(people.map((u) => [u.id, displayName(u)]));
  const entries = rows.map((r) => ({ ...toPeriod(r), setBy: names.get(r.setById) ?? "Someone" }));
  return groupAway(entries, today);
}

export type AwayOn = { reason: string; from: string; until: string };

/** Who among `userIds` is Away on `date`, with the period (the Reason is for Committee's eyes only). */
export async function listAwayOn(db: Db, userIds: string[], date: string): Promise<Map<string, AwayOn>> {
  if (userIds.length === 0) return new Map();
  const rows: (typeof playerAway.$inferSelect)[] = await db
    .select()
    .from(playerAway)
    .where(and(inArray(playerAway.userId, userIds), isNull(playerAway.removedAt)));
  const away = new Map<string, AwayOn>();
  for (const r of rows) {
    if (r.from > date || r.until < date) continue;
    const current = away.get(r.userId);
    if (!current || r.until > current.until) away.set(r.userId, { reason: r.reason, from: r.from, until: r.until });
  }
  return away;
}

/**
 * Who in Committee to push, and what to say, about a period just added: not whoever set it, and
 * only when it starts within 14 days. Null otherwise.
 */
export async function awayAlert(
  db: Db,
  id: string,
  today = londonToday(),
): Promise<{ userIds: string[]; title: string; body: string; playerId: string } | null> {
  const row = await findAway(db, id);
  if (!row) return null;
  const people = await listKnownUsers(db);
  const player = people.find((p) => p.id === row.userId);
  const title = awayPushMessage({ name: player ? displayName(player) : "Someone", from: row.from, until: row.until }, today);
  if (!title) return null;
  const userIds = people
    .filter((p) => p.accessState === "approved" && isCommitteeOrAbove(p.role as Role) && p.id !== row.setById)
    .map((p) => p.id)
    .sort();
  return { userIds, title, body: "", playerId: row.userId };
}

/** Removes every period of time Away for a User. Not permission-checked: used by account deletion. */
export async function clearAway(db: Db, userId: string) {
  await db.delete(playerAway).where(eq(playerAway.userId, userId));
}
