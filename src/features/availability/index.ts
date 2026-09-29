import { and, eq, inArray } from "drizzle-orm";
import { seasonStart } from "@/features/duties";
import { getEvent, listEventsBetween, londonParts, londonToUtc, type Event } from "@/features/events";
import { listPlayers } from "@/features/players";
import { displayName, listApprovedUsers } from "@/features/users";
import type { MailSender } from "@/lib/mail";
import { askEmail, type AskedEvent } from "./announce-rules";
import { availabilityAnnouncement, availabilityNudge, availabilityReply } from "./schema";
import {
  mayReply,
  myReplies,
  replyGroup,
  seasonRecord,
  summarizeAvailability,
  takesReplies,
  validateReply,
  waitingOnReply,
  type AvailabilitySummary,
  type MyReply,
  type Nudge,
  type Reply,
  type ReplyStatus,
  type SeasonRecord,
  type WaitingAsk,
} from "./rules";

export { takesReplies } from "./rules";
export { askPush, chaseMessage } from "./announce-rules";
export type { AskedEvent } from "./announce-rules";
export type { AvailabilityRow, AvailabilitySummary, MyReply, RecordLine, ReplyCounts, ReplyStatus, SeasonRecord, WaitingAsk } from "./rules";

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
  /** The Events one reply covers, still going ahead, for headings and the chase message. */
  events: AskedEvent[];
  announcement: { at: Date; by: string; replyBy: Date | null } | null;
  canAnnounce: boolean;
  canNudge: boolean;
};

/**
 * The Events one reply to `event` covers (every Match that London day), when replies
 * close, and those Events' titles and starts.
 */
async function groupFor(db: Db, event: Event) {
  if (event.eventType !== "match") return { ...replyGroup(event, []), events: [event] };
  const dayStart = londonToUtc(londonParts(event.start).date, "00:00");
  const sameDay: Event[] = await listEventsBetween(db, dayStart, new Date(dayStart.getTime() + 26 * 3_600_000));
  const group = replyGroup(event, sameDay);
  const byId = new Map([event, ...sameDay].map((e) => [e.id, e]));
  return { ...group, events: group.eventIds.map((id) => byId.get(id)!) };
}

const asked = (events: Event[]): AskedEvent[] => {
  const goingAhead = events.filter((e) => !e.cancelled);
  return (goingAhead.length > 0 ? goingAhead : events).map((e) => ({ title: e.title, start: e.start }));
};

async function repliesFor(db: Db, eventIds: string[]): Promise<Reply[]> {
  return db.select().from(availabilityReply).where(inArray(availabilityReply.eventId, eventIds));
}

/** Players by id, leaving out Blocked Users. */
async function playersById(db: Db) {
  const [listing, people] = await Promise.all([listPlayers(db), listApprovedUsers(db)]);
  const blocked = new Set(people.filter((u: { accessState: string }) => u.accessState === "blocked").map((u: { id: string }) => u.id));
  return new Map([...listing.playing, ...listing.notPlaying].filter((p) => !blocked.has(p.id)).map((p) => [p.id, p]));
}

/** Players who replied Available to each of `eventIds`, grouped by Event, per-event only (no day-grouping). */
export async function listAvailableUserIds(db: Db, eventIds: string[]): Promise<Map<string, Set<string>>> {
  if (eventIds.length === 0) return new Map();
  const [replies, players] = await Promise.all([repliesFor(db, eventIds), playersById(db)]);
  const byEvent = new Map<string, Set<string>>();
  for (const reply of replies as (Reply & { eventId: string })[]) {
    if (reply.status !== "available") continue;
    const player = players.get(reply.userId);
    if (!player?.playing) continue;
    byEvent.set(reply.eventId, (byEvent.get(reply.eventId) ?? new Set()).add(reply.userId));
  }
  return byEvent;
}

async function announcementFor(db: Db, eventIds: string[]) {
  const rows = await db.select().from(availabilityAnnouncement).where(inArray(availabilityAnnouncement.eventId, eventIds));
  return rows.sort((a: { createdAt: Date }, b: { createdAt: Date }) => a.createdAt.getTime() - b.createdAt.getTime())[0] as
    | typeof availabilityAnnouncement.$inferSelect
    | undefined;
}

async function nudgesFor(db: Db, eventIds: string[]): Promise<Nudge[]> {
  return db.select().from(availabilityNudge).where(inArray(availabilityNudge.eventId, eventIds));
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
    return {
      takesReplies: false,
      open: false,
      canReplyForSelf: false,
      canReplyForOthers: false,
      myReply: null,
      summary: empty,
      events: [],
      announcement: null,
      canAnnounce: false,
      canNudge: false,
    };
  }

  const { eventIds, closesAt, events } = await groupFor(db, event);
  const [replies, players, people, announcement, nudges] = await Promise.all([
    repliesFor(db, eventIds),
    playersById(db),
    listApprovedUsers(db),
    announcementFor(db, eventIds),
    nudgesFor(db, eventIds),
  ]);
  const names = new Map<string, string>(people.map((u: Parameters<typeof displayName>[0] & { id: string }) => [u.id, displayName(u)]));
  const summary = summarizeAvailability({
    players: [...players.values()],
    replies,
    viewer,
    nameOf: (id) => names.get(id),
    replyBy: announcement?.replyBy ?? null,
    nudges,
  });

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
    events: asked(events),
    announcement: announcement
      ? { at: announcement.createdAt, by: names.get(announcement.announcedById) ?? "Someone", replyBy: announcement.replyBy }
      : null,
    canAnnounce: open && viewer.committee && !announcement,
    canNudge: open && viewer.committee && summary.noReply.length > 0,
  };
}

type AskInput = { eventId: string; viewer: Viewer; url: string; mail: MailSender };
// `reachedUserIds` is who the email got to, for the caller to also push to (see the `push` feature).
type AskResult = { ok: true; sent: number; reachedUserIds: string[] } | { ok: false; error: string };

/** Emails each of `playerIds` the Announce or Nudge email; returns who it reached. */
async function sendAsk(
  db: Db,
  kind: "announce" | "nudge",
  playerIds: string[],
  { events, url, replyBy, mail }: { events: AskedEvent[]; url: string; replyBy: Date | null; mail: MailSender },
): Promise<string[]> {
  const people = await listApprovedUsers(db);
  const reached: string[] = [];
  for (const u of people.filter((p: { id: string; accessState: string }) => playerIds.includes(p.id) && p.accessState === "approved")) {
    const email = askEmail({ kind, events, url, replyBy, name: displayName(u).split(" ")[0] });
    try {
      await mail.send({ to: u.email, ...email });
      reached.push(u.id);
    } catch (error) {
      console.error(`[availability] couldn't email ${u.email}`, error);
    }
  }
  return reached;
}

/**
 * Announce (Committee, once per Event — once per day for Matches): emails every Player
 * with No reply, with an optional Reply By after which replies are marked late.
 */
export async function announce(db: Db, input: AskInput & { replyBy: Date | null }, now: Date = new Date()): Promise<AskResult> {
  const availability = await getAvailability(db, input.eventId, input.viewer, now);
  if (availability.announcement) return { ok: false, error: "This has already been announced." };
  if (!availability.canAnnounce) return { ok: false, error: "You can't announce this one." };
  if (input.replyBy && input.replyBy <= now) return { ok: false, error: "Pick a reply-by time that's still to come." };

  await db.insert(availabilityAnnouncement).values({
    id: crypto.randomUUID(),
    eventId: input.eventId,
    announcedById: input.viewer.id,
    replyBy: input.replyBy,
    createdAt: now,
  });
  const reached = await sendAsk(db, "announce", availability.summary.noReply.map((r) => r.userId), {
    events: availability.events,
    url: input.url,
    replyBy: input.replyBy,
    mail: input.mail,
  });
  return { ok: true, sent: reached.length, reachedUserIds: reached };
}

/** Nudge (Committee): emails a reminder to everyone with No reply, or just `playerIds` among them. */
export async function nudge(db: Db, input: AskInput & { playerIds: string[] | null }, now: Date = new Date()): Promise<AskResult> {
  const availability = await getAvailability(db, input.eventId, input.viewer, now);
  if (!availability.canNudge) return { ok: false, error: "You can't nudge anyone for this one." };

  const noReply = availability.summary.noReply.map((r) => r.userId);
  const chosen = input.playerIds ? noReply.filter((id) => input.playerIds!.includes(id)) : noReply;
  const reached = await sendAsk(db, "nudge", chosen, {
    events: availability.events,
    url: input.url,
    replyBy: availability.announcement?.replyBy ?? null,
    mail: input.mail,
  });
  if (reached.length > 0) {
    await db.insert(availabilityNudge).values(
      reached.map((userId) => ({ id: crypto.randomUUID(), eventId: input.eventId, userId, nudgedById: input.viewer.id, createdAt: now })),
    );
  }
  return { ok: true, sent: reached.length, reachedUserIds: reached };
}

async function playerRepliesFor(db: Db, playerId: string, eventIds: string[]): Promise<(Reply & { eventId: string })[]> {
  if (eventIds.length === 0) return [];
  return db
    .select()
    .from(availabilityReply)
    .where(and(eq(availabilityReply.userId, playerId), inArray(availabilityReply.eventId, eventIds)));
}

/** For Home: the announced Events still open that the Player hasn't replied to, soonest first. */
export async function listWaitingOnReply(db: Db, playerId: string, now: Date = new Date()): Promise<WaitingAsk[]> {
  const player = (await playersById(db)).get(playerId);
  if (!player?.playing) return [];
  // From the start of today, so a Match day whose first Match has started counts as closed.
  const from = londonToUtc(londonParts(now).date, "00:00");
  const events: Event[] = await listEventsBetween(db, from, new Date(now.getTime() + 366 * 86_400_000));
  const ids = events.map((e) => e.id);
  if (ids.length === 0) return [];
  const [announcements, replies] = await Promise.all([
    db.select().from(availabilityAnnouncement).where(inArray(availabilityAnnouncement.eventId, ids)),
    playerRepliesFor(db, playerId, ids),
  ]);
  return waitingOnReply({ events, announcements, repliedEventIds: new Set(replies.map((r) => r.eventId)), now });
}

/**
 * For the Agenda: the Player's own reply to each Training and Match in `events`, and
 * whether they can still reply. `events` must include the whole London day of any Match.
 */
export async function listMyReplies(db: Db, playerId: string, events: Event[], now: Date = new Date()): Promise<Record<string, MyReply>> {
  const [player, replies] = await Promise.all([
    playersById(db).then((players) => players.get(playerId)),
    playerRepliesFor(db, playerId, events.filter((e) => takesReplies(e.eventType)).map((e) => e.id)),
  ]);
  return myReplies({ events, replies, playing: !!player?.playing, now });
}

/** For the Player page: this season's Matches and Training, counted by the Player's replies — all, and announced only. */
export async function getSeasonRecord(db: Db, playerId: string, now: Date = new Date()): Promise<SeasonRecord> {
  const since = seasonStart(now);
  const events: Event[] = await listEventsBetween(db, since, now);
  const ids = events.map((e) => e.id);
  const [replies, announcements] = await Promise.all([
    playerRepliesFor(db, playerId, ids),
    ids.length === 0 ? [] : db.select().from(availabilityAnnouncement).where(inArray(availabilityAnnouncement.eventId, ids)),
  ]);
  const announcedEventIds = new Set<string>(announcements.map((a: { eventId: string }) => a.eventId));
  return seasonRecord({ events, replies, announcedEventIds, since, now });
}
