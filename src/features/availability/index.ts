import { inArray } from "drizzle-orm";
import { getEvent, listEventsBetween, londonParts, londonToUtc, type Event } from "@/features/events";
import { listPlayers } from "@/features/players";
import { displayName, listApprovedUsers } from "@/features/users";
import { availabilityReply } from "./schema";
import {
  mayReply,
  replyGroup,
  summarizeAvailability,
  takesReplies,
  validateReply,
  type AvailabilitySummary,
  type Reply,
  type ReplyStatus,
} from "./rules";

export { takesReplies } from "./rules";
export type { AvailabilityRow, AvailabilitySummary, ReplyStatus } from "./rules";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

type Viewer = { id: string; committee: boolean };

export type Availability = {
  takesReplies: boolean;
  /** False once the Event (or the day's first Match) has started, or it's Cancelled. */
  open: boolean;
  canReplyForSelf: boolean;
  canReplyForOthers: boolean;
  myReply: { status: ReplyStatus; note: string; reason: string; setBy: string | null } | null;
  summary: AvailabilitySummary;
};

/** The Events one reply to `event` covers (every Match that London day), and when replies close. */
async function groupFor(db: Db, event: Event) {
  if (event.eventType !== "match") return replyGroup(event, []);
  const dayStart = londonToUtc(londonParts(event.start).date, "00:00");
  const sameDay = await listEventsBetween(db, dayStart, new Date(dayStart.getTime() + 26 * 3_600_000));
  return replyGroup(event, sameDay);
}

async function repliesFor(db: Db, eventIds: string[]): Promise<Reply[]> {
  return db.select().from(availabilityReply).where(inArray(availabilityReply.eventId, eventIds));
}

async function playersById(db: Db) {
  const listing = await listPlayers(db);
  return new Map([...listing.playing, ...listing.notPlaying].map((p) => [p.id, p]));
}

/**
 * Saves a reply for `playerId` — their own, or one Committee gives for them. A reply to a
 * Match counts for every Match that day. Earlier replies are kept; the latest counts.
 */
export async function saveReply(
  db: Db,
  input: { eventId: string; playerId: string; viewer: Viewer; status: ReplyStatus; note: string; reason: string },
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  const event = await getEvent(db, input.eventId);
  if (!event) return { ok: false, error: "That event doesn't exist." };
  const player = (await playersById(db)).get(input.playerId);
  if (!player) return { ok: false, error: "That player doesn't exist." };

  const { closesAt } = await groupFor(db, event);
  if (!mayReply({ ...event, closesAt }, input.viewer, player, now)) {
    const closed = !takesReplies(event.eventType) || event.cancelled || now >= closesAt;
    return { ok: false, error: closed ? "Replies have closed for this one." : "You can't reply for them." };
  }

  const valid = validateReply(input);
  if (!valid.ok) return valid;

  await db.insert(availabilityReply).values({
    id: crypto.randomUUID(),
    eventId: input.eventId,
    userId: input.playerId,
    ...valid.reply,
    setById: input.viewer.id,
    createdAt: now,
  });
  return { ok: true };
}

/** Everything the Availability card on Event detail shows, as `viewer` may see it. */
export async function getAvailability(db: Db, eventId: string, viewer: Viewer, now: Date = new Date()): Promise<Availability> {
  const event = await getEvent(db, eventId);
  const empty: AvailabilitySummary = { available: [], notAvailable: [], noReply: [] };
  if (!event || !takesReplies(event.eventType)) {
    return { takesReplies: false, open: false, canReplyForSelf: false, canReplyForOthers: false, myReply: null, summary: empty };
  }

  const { eventIds, closesAt } = await groupFor(db, event);
  const [replies, players, people] = await Promise.all([repliesFor(db, eventIds), playersById(db), listApprovedUsers(db)]);
  const names = new Map<string, string>(people.map((u: Parameters<typeof displayName>[0] & { id: string }) => [u.id, displayName(u)]));
  const summary = summarizeAvailability({ players: [...players.values()], replies, viewer, nameOf: (id) => names.get(id) });

  const self = players.get(viewer.id);
  const mine = [...summary.available, ...summary.notAvailable].find((r) => r.userId === viewer.id);
  const myStatus = summary.available.some((r) => r.userId === viewer.id) ? "available" : "not_available";
  const open = !event.cancelled && now < closesAt;

  return {
    takesReplies: true,
    open,
    canReplyForSelf: !!self && mayReply({ ...event, closesAt }, viewer, self, now),
    canReplyForOthers: open && viewer.committee,
    myReply: mine ? { status: myStatus, note: mine.note, reason: mine.reason ?? "", setBy: mine.setBy } : null,
    summary,
  };
}
