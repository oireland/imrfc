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
