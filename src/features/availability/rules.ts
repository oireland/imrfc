import { londonParts, type EventType } from "@/features/events";

export type ReplyStatus = "available" | "not_available";

export type ReplyInput = { status: ReplyStatus; note: string; reason: string };

/** A reply to save: Not available always carries a Reason; Available may carry a note ("late"). */
export function validateReply(input: ReplyInput): { ok: true; reply: ReplyInput } | { ok: false; error: string } {
  const note = input.note.trim();
  const reason = input.reason.trim();
  if (input.status === "not_available" && !reason) return { ok: false, error: "Say why you can't make it." };
  return input.status === "available"
    ? { ok: true, reply: { status: "available", note, reason: "" } }
    : { ok: true, reply: { status: "not_available", note: "", reason } };
}

export type Reply = {
  userId: string;
  status: ReplyStatus;
  note: string;
  reason: string;
  /** Who saved it: the Player themself, or the Committee member who replied for them. */
  setById: string;
  createdAt: Date;
};

export type AvailabilityPlayer = { id: string; name: string; playing: boolean };

export type AvailabilityRow = {
  userId: string;
  name: string;
  note: string;
  /** Null when the viewer may not see it (only Committee and the Player can). */
  reason: string | null;
  /** The name of whoever replied for the Player, or null if they replied themself. */
  setBy: string | null;
  /** The reply came after the Reply By. */
  late: boolean;
  /** When a No reply Player was last nudged, or null if never. */
  nudgedAt: Date | null;
};

export type Nudge = { userId: string; createdAt: Date };

export type AvailabilitySummary = {
  available: AvailabilityRow[];
  notAvailable: AvailabilityRow[];
  noReply: AvailabilityRow[];
};

/** Each Player's latest reply. */
export function latestReplies(replies: Reply[]): Map<string, Reply> {
  const latest = new Map<string, Reply>();
  for (const r of replies) {
    const current = latest.get(r.userId);
    if (!current || r.createdAt > current.createdAt) latest.set(r.userId, r);
  }
  return latest;
}

/**
 * Sorts Players with Playing on into Available, Not available and No reply by their
 * latest reply. Reasons are shown only to Committee and to the Player themself. Replies
 * after the Reply By are late; No reply Players carry when they were last nudged.
 */
export function summarizeAvailability({
  players,
  replies,
  viewer,
  nameOf,
  replyBy = null,
  nudges = [],
}: {
  players: AvailabilityPlayer[];
  replies: Reply[];
  viewer: { id: string; committee: boolean };
  /** Names for whoever set a reply, when they aren't in `players`. */
  nameOf?: (userId: string) => string | undefined;
  replyBy?: Date | null;
  nudges?: Nudge[];
}): AvailabilitySummary {
  const names = new Map(players.map((p) => [p.id, p.name]));
  const latest = latestReplies(replies);
  const lastNudged = new Map<string, Date>();
  for (const n of nudges) {
    const current = lastNudged.get(n.userId);
    if (!current || n.createdAt > current) lastNudged.set(n.userId, n.createdAt);
  }
  const summary: AvailabilitySummary = { available: [], notAvailable: [], noReply: [] };
  const playing = players.filter((p) => p.playing).sort((a, b) => a.name.localeCompare(b.name));
  for (const player of playing) {
    const r = latest.get(player.id);
    const row: AvailabilityRow = {
      userId: player.id,
      name: player.name,
      note: r?.note ?? "",
      reason: r && (viewer.committee || viewer.id === player.id) ? r.reason : null,
      setBy: r && r.setById !== player.id ? (names.get(r.setById) ?? nameOf?.(r.setById) ?? "Someone") : null,
      late: !!r && !!replyBy && r.createdAt > replyBy,
      nudgedAt: null,
    };
    if (!r) summary.noReply.push({ ...row, reason: null, nudgedAt: lastNudged.get(player.id) ?? null });
    else if (r.status === "available") summary.available.push({ ...row, reason: null });
    else summary.notAvailable.push(row);
  }
  return summary;
}

export type GroupEvent = { id: string; eventType: EventType; start: Date; cancelled: boolean };

/** Whether Players reply to this kind of Event at all. */
export function takesReplies(eventType: EventType): boolean {
  return eventType === "training" || eventType === "match";
}

/**
 * The Events one reply covers: a Match's reply covers every Match that London day
 * (double-headers); anything else stands alone. Replies close at the group's first
 * start that's still going ahead.
 */
export function replyGroup(target: GroupEvent, sameDay: GroupEvent[]): { eventIds: string[]; closesAt: Date } {
  if (target.eventType !== "match") return { eventIds: [target.id], closesAt: target.start };
  const day = londonParts(target.start).date;
  const group = [target, ...sameDay.filter((e) => e.id !== target.id)]
    .filter((e) => e.eventType === "match" && londonParts(e.start).date === day)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const goingAhead = group.filter((e) => !e.cancelled);
  return { eventIds: group.map((e) => e.id), closesAt: (goingAhead[0] ?? target).start };
}

/**
 * Whether `viewer` may save a reply for `player` now: Training and Matches only, not
 * Cancelled, before replies close, the Player has Playing on, and the viewer is that
 * Player or Committee.
 */
export function mayReply(
  event: { eventType: EventType; cancelled: boolean; closesAt: Date },
  viewer: { id: string; committee: boolean },
  player: { id: string; playing: boolean },
  now: Date,
): boolean {
  return (
    takesReplies(event.eventType) &&
    !event.cancelled &&
    now < event.closesAt &&
    player.playing &&
    (viewer.id === player.id || viewer.committee)
  );
}

export type TitledEvent = GroupEvent & { title: string };

export type WaitingAsk = {
  /** The Event to open: the group's first that's still going ahead. */
  eventId: string;
  events: { title: string; start: Date }[];
  replyBy: Date | null;
};

/** Training and Match days: each Training alone, a day's Matches together. */
function replyGroups<E extends GroupEvent>(events: E[]): E[][] {
  const groups = new Map<string, E[]>();
  for (const e of events.filter((e) => takesReplies(e.eventType))) {
    const key = e.eventType === "match" ? `match:${londonParts(e.start).date}` : e.id;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return [...groups.values()].map((group) => group.sort((a, b) => a.start.getTime() - b.start.getTime()));
}

/**
 * The announced Events still open that a Player hasn't replied to, soonest first — one
 * per Training, one per day's Matches. `events` must include the whole London day of
 * any Match, so a day whose first Match has started counts as closed.
 */
export function waitingOnReply({
  events,
  announcements,
  repliedEventIds,
  now,
}: {
  events: TitledEvent[];
  announcements: { eventId: string; replyBy: Date | null }[];
  repliedEventIds: Set<string>;
  now: Date;
}): WaitingAsk[] {
  const asks: WaitingAsk[] = [];
  for (const group of replyGroups(events)) {
    const goingAhead = group.filter((e) => !e.cancelled);
    const announced = announcements.find((a) => group.some((e) => e.id === a.eventId));
    if (!announced || goingAhead.length === 0 || now >= goingAhead[0].start) continue;
    if (group.some((e) => repliedEventIds.has(e.id))) continue;
    asks.push({
      eventId: goingAhead[0].id,
      events: goingAhead.map((e) => ({ title: e.title, start: e.start })),
      replyBy: announced.replyBy,
    });
  }
  // Replies close at the group's first start, which is its first Event's.
  return asks.sort((a, b) => a.events[0].start.getTime() - b.events[0].start.getTime());
}

/** A Player's latest reply to any Event in `group`. */
function latestInGroup<R extends { eventId: string; createdAt: Date }>(group: GroupEvent[], replies: R[]): R | undefined {
  const ids = new Set(group.map((e) => e.id));
  return replies.filter((r) => ids.has(r.eventId)).reduce<R | undefined>((a, r) => (!a || r.createdAt > a.createdAt ? r : a), undefined);
}

export type ReplyCounts = { available: number; notAvailable: number; noReply: number };
/** Every Event counted, and just the ones Committee announced. */
export type RecordLine = { all: ReplyCounts; announced: ReplyCounts };
export type SeasonRecord = { matches: RecordLine; training: RecordLine };

/**
 * A Player's Availability this season (from `since`): each Training and each Match day
 * that has started and wasn't Cancelled, counted by their latest reply to it — for all of
 * them, and again for the announced ones (a Match day is announced if any of its Matches is).
 */
export function seasonRecord({
  events,
  replies,
  announcedEventIds,
  since,
  now,
}: {
  events: GroupEvent[];
  /** This Player's replies. */
  replies: { eventId: string; status: ReplyStatus; createdAt: Date }[];
  announcedEventIds: Set<string>;
  since: Date;
  now: Date;
}): SeasonRecord {
  const line = (): RecordLine => ({
    all: { available: 0, notAvailable: 0, noReply: 0 },
    announced: { available: 0, notAvailable: 0, noReply: 0 },
  });
  const record: SeasonRecord = { matches: line(), training: line() };
  for (const group of replyGroups(events.filter((e) => !e.cancelled && e.start >= since && e.start < now))) {
    const latest = latestInGroup(group, replies);
    const key = !latest ? "noReply" : latest.status === "available" ? "available" : "notAvailable";
    const counts = group[0].eventType === "match" ? record.matches : record.training;
    counts.all[key]++;
    if (group.some((e) => announcedEventIds.has(e.id))) counts.announced[key]++;
  }
  return record;
}

export type MyReply = { status: ReplyStatus | null; open: boolean };

/**
 * A Player's own reply to each Training and Match in `events` (Socials left out): their
 * latest reply to its group (a day's Matches share one), and whether they can still
 * reply — Playing on, not Cancelled, and before the group's first start still going ahead.
 */
export function myReplies({
  events,
  replies,
  playing,
  now,
}: {
  events: GroupEvent[];
  /** This Player's replies. */
  replies: { eventId: string; status: ReplyStatus; createdAt: Date }[];
  playing: boolean;
  now: Date;
}): Record<string, MyReply> {
  const result: Record<string, MyReply> = {};
  for (const group of replyGroups(events)) {
    const latest = latestInGroup(group, replies);
    const closesAt = group.find((e) => !e.cancelled)?.start;
    for (const e of group) {
      result[e.id] = { status: latest?.status ?? null, open: playing && !e.cancelled && !!closesAt && now < closesAt };
    }
  }
  return result;
}
