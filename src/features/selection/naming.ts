import { eq } from "drizzle-orm";
import { askStatus, type AskStatus } from "@/features/availability";
import { getEvent, londonParts } from "@/features/events";
import { displayName, isCommitteeOrAbove, listApprovedUsers, listKnownUsers } from "@/features/users";
import { emailLayout } from "@/lib/email-layout";
import { formatDay } from "@/lib/format-time";
import type { MailSender } from "@/lib/mail";
import { committeeAlert, diffNamed, noticeMessage, type Change, type Slot } from "./naming-rules";
import { selectionNotice, selectionShirt, selectionSent, teamNaming, type NoticeRecipient } from "./schema";
import { ROLES, buildSheet, type Role, type SheetLayout } from "./sheet";
import { getTeamSheet, settleFields } from "./team-sheet";
import { STARTING_SHIRTS } from "./shirts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type Viewer = { id: string; committee: boolean };
type Result = { ok: true } | { ok: false; error: string };
type SendResult = { ok: true; noticeId: string | null; sending: number } | { ok: false; error: string };

/** How a Name the team or Send changes went: still sending, reached everyone, or someone wasn't reached. */
export type NoticeStatus = { id: string; kind: "name" | "changes"; by: string; status: AskStatus; total: number; sent: number; missed: string[] };

export type Naming = {
  named: { at: Date; by: string } | null;
  /** Committee can Name the team now: it isn't named, and the Match is still to come. */
  canName: boolean;
  /** Named, with changes Committee haven't sent yet, and the Match still to come. */
  canSend: boolean;
  missing: string[];
  unsent: { count: number; lines: string[] };
  /** Notices still sending, or that failed and haven't been dismissed. */
  notices: NoticeStatus[];
};

const asSlot = (r: { shirt: number; userId: string | null; guestName: string | null; roles: string[] }): Slot => ({
  shirt: r.shirt,
  userId: r.userId,
  guestName: r.guestName,
  roles: r.roles,
});

const boardSlots = async (db: Db, eventId: string): Promise<Slot[]> => (await db.select().from(selectionShirt).where(eq(selectionShirt.eventId, eventId))).map(asSlot);
const sentSlots = async (db: Db, eventId: string): Promise<Slot[]> => (await db.select().from(selectionSent).where(eq(selectionSent.eventId, eventId))).map(asSlot);

async function namesById(db: Db) {
  const people = await listKnownUsers(db);
  return { people, names: new Map<string, string>(people.map((u: Parameters<typeof displayName>[0] & { id: string }) => [u.id, displayName(u)])) };
}

const unsentLines = (changes: Change[], quiet: number, names: Map<string, string>): string[] => {
  const who = (c: Change) => names.get(c.userId) ?? "Someone";
  const lines = changes.map((c) => (c.kind === "moved" ? `${who(c)} moves to ${c.shirt}` : c.kind === "in" ? `${who(c)} comes in at ${c.shirt}` : `${who(c)} is dropped`));
  if (quiet > 0) lines.push(`${quiet} ${quiet === 1 ? "edit" : "edits"} to Guests or Match Day Roles`);
  return lines;
};

function noticeStatus(row: typeof selectionNotice.$inferSelect, names: Map<string, string>, now: Date): NoticeStatus {
  const status = askStatus({ createdAt: row.createdAt, finishedAt: row.finishedAt, missed: row.missedIds.length }, now);
  const ids = row.recipients.map((r) => r.userId);
  // A send that was cut off never recorded who it missed: count everyone not reached.
  const missed = status === "failed" && !row.finishedAt ? ids.filter((id) => !row.reachedIds.includes(id)) : row.missedIds;
  return {
    id: row.id,
    kind: row.kind,
    by: names.get(row.sentById) ?? "Someone",
    status,
    total: ids.length,
    sent: row.reachedIds.length,
    missed: missed.map((id) => names.get(id) ?? "Someone"),
  };
}

/** Whether `viewer` can change this Match's team now; the reason if not. */
async function refuse(db: Db, eventId: string, viewer: Viewer, now: Date): Promise<{ ok: false; error: string } | null> {
  if (!viewer.committee) return { ok: false, error: "Only committee can notify the team." };
  const event = await getEvent(db, eventId);
  if (!event || event.eventType !== "match") return { ok: false, error: "That match doesn't exist." };
  if (event.cancelled) return { ok: false, error: "This match is cancelled." };
  if (event.start <= now) return { ok: false, error: "This match has already started." };
  return null;
}

/** Name the team's state for the board: whether it's named, what's unsent, what's missing. Committee only. */
export async function getNaming(db: Db, eventId: string, viewer: Viewer, now: Date = new Date()): Promise<Naming | null> {
  if (!viewer.committee) return null;
  const [sheet, [naming], { names }] = await Promise.all([
    getTeamSheet(db, eventId, viewer, now),
    db.select().from(teamNaming).where(eq(teamNaming.eventId, eventId)),
    namesById(db),
  ]);
  if (!sheet) return null;

  const noticeRows: (typeof selectionNotice.$inferSelect)[] = await db.select().from(selectionNotice).where(eq(selectionNotice.eventId, eventId));
  const notices = noticeRows
    .filter((n) => !n.dismissedAt)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((n) => noticeStatus(n, names, now))
    .filter((n) => n.status !== "sent");

  let unsent = { count: 0, lines: [] as string[] };
  if (naming) {
    const { changes, unsent: count } = diffNamed(await sentSlots(db, eventId), await boardSlots(db, eventId));
    unsent = { count, lines: unsentLines(changes, count - changes.length, names) };
  }
  const open = !sheet.readOnly;
  return {
    named: naming ? { at: naming.namedAt, by: names.get(naming.namedById) ?? "Someone" } : null,
    canName: open && !naming,
    canSend: open && Boolean(naming) && unsent.count > 0,
    missing: sheet.missing,
    unsent,
    notices,
  };
}

async function reachable(db: Db, recipients: NoticeRecipient[]): Promise<NoticeRecipient[]> {
  const people = await listApprovedUsers(db);
  const approved = new Set(people.map((p: { id: string }) => p.id));
  return recipients.filter((r) => approved.has(r.userId));
}

/** Records the notice for `recipients` (already reachable); null when there's nobody to tell. */
async function recordNotice(tx: Db, kind: "name" | "changes", eventId: string, viewer: Viewer, recipients: NoticeRecipient[], now: Date) {
  if (recipients.length === 0) return { noticeId: null, sending: 0 };
  const id = crypto.randomUUID();
  await tx.insert(selectionNotice).values({ id, eventId, kind, sentById: viewer.id, recipients, createdAt: now });
  return { noticeId: id, sending: recipients.length };
}

async function snapshot(tx: Db, eventId: string, slots: Slot[]) {
  await tx.delete(selectionSent).where(eq(selectionSent.eventId, eventId));
  if (slots.length) await tx.insert(selectionSent).values(slots.map((s) => ({ eventId, ...s })));
}

/**
 * Name the team (Committee, once per Match): everyone on the sheet except Guests is to be
 * told. The emails and pushes go out afterwards, with `deliverNotice`.
 */
export async function nameTheTeam(db: Db, input: { eventId: string; viewer: Viewer }, now: Date = new Date()): Promise<SendResult> {
  const denied = await refuse(db, input.eventId, input.viewer, now);
  if (denied) return denied;
  const [existing] = await db.select().from(teamNaming).where(eq(teamNaming.eventId, input.eventId));
  if (existing) return { ok: false, error: "This team has already been notified." };
  const slots = await boardSlots(db, input.eventId);
  if (slots.length === 0) return { ok: false, error: "Pick the team first." };

  const recipients = await reachable(db, slots.flatMap((s) => (s.userId ? [{ userId: s.userId, kind: "in" as const, shirt: s.shirt }] : [])));
  const sent = await db.transaction(async (tx: Db) => {
    await tx.insert(teamNaming).values({ eventId: input.eventId, namedAt: now, namedById: input.viewer.id });
    await snapshot(tx, input.eventId, slots);
    return recordNotice(tx, "name", input.eventId, input.viewer, recipients, now);
  });
  return { ok: true, ...sent };
}

/** Send changes (Committee): the Team card takes on the board as it is now, and only the Players affected are told. */
export async function sendChanges(db: Db, input: { eventId: string; viewer: Viewer }, now: Date = new Date()): Promise<SendResult> {
  const denied = await refuse(db, input.eventId, input.viewer, now);
  if (denied) return denied;
  const [existing] = await db.select().from(teamNaming).where(eq(teamNaming.eventId, input.eventId));
  if (!existing) return { ok: false, error: "Notify the team first." };

  const current = await boardSlots(db, input.eventId);
  const { changes } = diffNamed(await sentSlots(db, input.eventId), current);
  const recipients = await reachable(db, changes);
  const sent = await db.transaction(async (tx: Db) => {
    await snapshot(tx, input.eventId, current);
    return recordNotice(tx, "changes", input.eventId, input.viewer, recipients, now);
  });
  return { ok: true, ...sent };
}

/** The email Name the team and Send changes send, in the Clubhouse look. */
function noticeEmail(message: { title: string; body: string }, name: string, url: string, eyebrow: string) {
  const text = [`Hi ${name},`, "", message.body, `See the team: ${url}`, "", "IMRFC"].join("\n");
  const html = emailLayout({
    preview: message.body,
    eyebrow,
    heading: message.title,
    paragraphs: [`Hi ${name},`, message.body],
    button: { label: "See the team", href: url },
  });
  return { subject: message.title, text, html };
}

/**
 * Sends a Name the team or Send changes' emails, one Player at a time, and records who
 * they reached and who they missed. Meant to run after the response. Returns who was
 * reached with what to say, for the caller to also push (see the `push` feature).
 */
export async function deliverNotice(
  db: Db,
  noticeId: string,
  { url, mail }: { url: string; mail: MailSender },
  now: Date = new Date(),
): Promise<{ reached: { userId: string; title: string; body: string }[] }> {
  const [row] = await db.select().from(selectionNotice).where(eq(selectionNotice.id, noticeId));
  const notice = row as typeof selectionNotice.$inferSelect | undefined;
  if (!notice || notice.finishedAt) return { reached: [] };

  // A retry leaves out the Players an earlier go already reached.
  const before = notice.reachedIds;
  const reached: { userId: string; title: string; body: string }[] = [];
  try {
    const settled = await settleFields(db, notice.eventId);
    const event = settled?.event ?? (await getEvent(db, notice.eventId));
    const team = { label: event?.teams?.[0]?.name ?? event?.title ?? "team", date: event ? formatDay(event.start) : "" };
    const { people } = await namesById(db);
    for (const recipient of notice.recipients.filter((r) => !before.includes(r.userId))) {
      const person = people.find((p: { id: string }) => p.id === recipient.userId);
      if (!person) continue;
      const message = noticeMessage(recipient, team);
      try {
        await mail.send({
          to: person.email,
          ...noticeEmail(message, displayName(person).split(" ")[0], url, notice.kind === "name" ? "Team named" : "Team change"),
        });
        reached.push({ userId: recipient.userId, ...message });
      } catch (error) {
        console.error(`[selection] couldn't email ${person.email}`, error);
      }
    }
  } catch (error) {
    console.error(`[selection] the ${notice.kind} notice for ${notice.eventId} stopped part way`, error);
  }

  const reachedIds = [...before, ...reached.map((r) => r.userId)];
  await db
    .update(selectionNotice)
    .set({ reachedIds, missedIds: notice.recipients.map((r) => r.userId).filter((id) => !reachedIds.includes(id)), finishedAt: now })
    .where(eq(selectionNotice.id, noticeId));
  return { reached };
}

/** How a notice's emails are going, for Committee; null for anyone else. */
export async function getNotice(db: Db, noticeId: string, viewer: Viewer, now: Date = new Date()): Promise<NoticeStatus | null> {
  if (!viewer.committee) return null;
  const [row] = await db.select().from(selectionNotice).where(eq(selectionNotice.id, noticeId));
  return row ? noticeStatus(row, (await namesById(db)).names, now) : null;
}

/**
 * Retries a failed notice (Committee): puts it back to sending so `deliverNotice` can run
 * again for whoever it hasn't reached. A send that was cut off never recorded who it
 * reached, so a retry emails everyone again.
 */
export async function retryNotice(db: Db, noticeId: string, viewer: Viewer, now: Date = new Date()): Promise<SendResult> {
  if (!viewer.committee) return { ok: false, error: "Only committee can do that." };
  const [row] = await db.select().from(selectionNotice).where(eq(selectionNotice.id, noticeId));
  const notice = row as typeof selectionNotice.$inferSelect | undefined;
  const status = notice && !notice.dismissedAt ? askStatus({ createdAt: notice.createdAt, finishedAt: notice.finishedAt, missed: notice.missedIds.length }, now) : null;
  if (!notice || status !== "failed") return { ok: false, error: "That one isn't waiting to be retried." };

  await db.update(selectionNotice).set({ finishedAt: null, missedIds: [], createdAt: now }).where(eq(selectionNotice.id, noticeId));
  return { ok: true, noticeId, sending: notice.recipients.filter((r) => !notice.reachedIds.includes(r.userId)).length };
}

/** Takes a failed notice off the board (Committee). */
export async function dismissNotice(db: Db, noticeId: string, viewer: Viewer, now: Date = new Date()): Promise<Result> {
  if (!viewer.committee) return { ok: false, error: "Only committee can do that." };
  await db.update(selectionNotice).set({ dismissedAt: now }).where(eq(selectionNotice.id, noticeId));
  return { ok: true };
}

export type TeamCard = {
  eventId: string;
  label: string;
  cancelled: boolean;
  named: { at: Date; by: string };
  layout: SheetLayout;
  /** The viewer's own Shirt, if they're on the sheet. */
  mine: number | null;
};

/** The Team card on Event detail, for anyone signed in: the team as last sent, once named; null before. */
export async function getTeamCard(db: Db, eventId: string, viewer: Viewer, now: Date = new Date()): Promise<TeamCard | null> {
  void now;
  const [[naming], settled, slots, { names }] = await Promise.all([
    db.select().from(teamNaming).where(eq(teamNaming.eventId, eventId)),
    settleFields(db, eventId),
    sentSlots(db, eventId),
    namesById(db),
  ]);
  if (!naming || !settled) return null;

  return {
    eventId,
    label: settled.event.teams[0]?.name ?? settled.event.title,
    cancelled: settled.event.cancelled,
    named: { at: naming.namedAt, by: names.get(naming.namedById) ?? "Someone" },
    layout: buildSheet({
      date: formatDay(settled.event.start),
      fields: settled.fields,
      shirts: slots.map((s) => ({ shirt: s.shirt, name: s.userId ? (names.get(s.userId) ?? "Someone") : s.guestName!, roles: ROLES.filter((r) => s.roles.includes(r)) as Role[] })),
    }),
    mine: slots.find((s) => s.userId === viewer.id)?.shirt ?? null,
  };
}

export type PlayingCard = { eventId: string; label: string; start: Date; shirt: number; bench: boolean };

/** For Home: the named Matches still to come that `userId` is in, soonest first; none once Cancelled. */
export async function listPlayingFor(db: Db, userId: string, now: Date = new Date()): Promise<PlayingCard[]> {
  const rows: { eventId: string; shirt: number }[] = await db.select().from(selectionSent).where(eq(selectionSent.userId, userId));
  const cards: PlayingCard[] = [];
  for (const row of rows) {
    const event = await getEvent(db, row.eventId);
    if (!event || event.cancelled || event.start <= now) continue;
    cards.push({ eventId: row.eventId, label: event.teams[0]?.name ?? event.title, start: event.start, shirt: row.shirt, bench: row.shirt > STARTING_SHIRTS });
  }
  return cards.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * When a Player replies Not available (covering every Match that day) and they are on a
 * named, upcoming sheet: who in Committee to push, and what to say. Null otherwise.
 */
export async function alertOnNotAvailable(
  db: Db,
  input: { eventId: string; playerId: string },
  now: Date = new Date(),
): Promise<{ userIds: string[]; title: string; body: string; eventId: string } | null> {
  const replied = await getEvent(db, input.eventId);
  if (!replied) return null;
  const day = londonParts(replied.start).date;
  const rows: { eventId: string; shirt: number }[] = await db.select().from(selectionSent).where(eq(selectionSent.userId, input.playerId));
  for (const row of rows) {
    const event = await getEvent(db, row.eventId);
    if (!event || event.cancelled || event.start <= now || londonParts(event.start).date !== day) continue;

    const { people, names } = await namesById(db);
    const userIds = people
      .filter((p: { id: string; role: string; accessState: string }) => p.accessState === "approved" && isCommitteeOrAbove(p.role as never) && p.id !== input.playerId)
      .map((p: { id: string }) => p.id)
      .sort();
    const message = committeeAlert({ name: names.get(input.playerId) ?? "Someone", shirt: row.shirt, label: event.teams[0]?.name ?? event.title, date: formatDay(event.start) });
    return { userIds, ...message, eventId: row.eventId };
  }
  return null;
}

