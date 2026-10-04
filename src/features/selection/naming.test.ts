import { describe, expect, it } from "vitest";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { saveReply } from "@/features/availability";
import { cancelEvent, createEvent, listTeams, type NewEvent } from "@/features/events";
import { user } from "@/features/users";
import type { MailSender } from "@/lib/mail";
import {
  alertOnNotAvailable,
  deliverNotice,
  dismissNotice,
  getNaming,
  getNotice,
  getTeamCard,
  listPlayingFor,
  nameTheTeam,
  pickGuest,
  pickPlayer,
  retryNotice,
  sendChanges,
  setRoles,
} from "./index";

const now = new Date("2026-10-01T12:00:00Z");
const tom = { id: "tom", committee: true };
const sam = { id: "sam", committee: false };

async function setup() {
  const db = await createTestDb();
  await migrate(db);
  await db.insert(user).values([
    { id: "tom", name: "Tom Hale", email: "tom@x.org", accessState: "approved", role: "committee" },
    { id: "sam", name: "Sam Patel", email: "sam@x.org", accessState: "approved", preferredPosition: "Hooker" },
    { id: "jo", name: "Jo King", email: "jo@x.org", accessState: "approved", preferredPosition: "Lock" },
    { id: "kit", name: "Kit Lane", email: "kit@x.org", accessState: "approved" },
    { id: "ann", name: "Ann Roe", email: "ann@x.org", accessState: "approved", role: "committee" },
  ]);
  await listTeams(db);
  return db;
}
type Db = Awaited<ReturnType<typeof setup>>;

async function makeMatch(db: Db, start = "2026-10-03T13:30:00Z", teamId = "1st XV") {
  const startDate = new Date(start);
  const made = await createEvent(db, {
    eventType: "match",
    start: startDate,
    end: new Date(startDate.getTime() + 2 * 3_600_000),
    venue: "Harlington",
    matchDetails: { teamId, opponent: "Barts", homeAway: "home", competition: "bucs", meetTime: startDate },
  } as NewEvent);
  if (!made.ok) throw new Error(made.error);
  return made.event.id;
}

function fakeMail(failFor: string[] = []) {
  const sent: { to: string; subject: string; text: string; html?: string }[] = [];
  const mail: MailSender = {
    async send(message) {
      if (failFor.includes(message.to)) throw new Error("bounced");
      sent.push(message);
    },
  };
  return { mail, sent };
}

const url = (eventId: string) => `https://imrfc.test/events/${eventId}`;

async function picked(db: Db) {
  const eventId = await makeMatch(db);
  await pickPlayer(db, { eventId, shirt: 2, userId: "sam", viewer: tom }, now);
  await pickPlayer(db, { eventId, shirt: 4, userId: "jo", viewer: tom }, now);
  await pickGuest(db, { eventId, shirt: 5, name: "Ringer", viewer: tom }, now);
  return eventId;
}

async function named(db: Db) {
  const eventId = await picked(db);
  const result = await nameTheTeam(db, { eventId, viewer: tom }, now);
  if (!result.ok) throw new Error(result.error);
  const { mail, sent } = fakeMail();
  const delivered = await deliverNotice(db, result.noticeId!, { url: url(eventId), mail }, now);
  return { eventId, result, delivered, sent };
}

describe("nameTheTeam", () => {
  it("tells everyone on the sheet except Guests, by email, and says when and by whom it was named", async () => {
    const db = await setup();
    const eventId = await picked(db);
    await pickPlayer(db, { eventId, shirt: 20, userId: "kit", viewer: tom }, now);

    const result = await nameTheTeam(db, { eventId, viewer: tom }, now);
    expect(result).toEqual({ ok: true, noticeId: expect.any(String), sending: 3 });

    const { mail, sent } = fakeMail();
    const delivered = await deliverNotice(db, result.ok ? result.noticeId! : "", { url: url(eventId), mail }, now);
    expect(delivered.reached.map((r) => r.userId).sort()).toEqual(["jo", "kit", "sam"]);
    expect(sent.map((m) => m.to).sort()).toEqual(["jo@x.org", "kit@x.org", "sam@x.org"]);
    const toSam = sent.find((m) => m.to === "sam@x.org")!;
    expect(toSam.subject).toBe("You're in the 1st XV");
    expect(toSam.text).toContain("You're in the 1st XV for Sat 3 Oct, at 2 (Hooker).");
    expect(toSam.text).toContain(url(eventId));
    expect(sent.find((m) => m.to === "kit@x.org")!.text).toContain("on the bench (20)");

    expect((await getNaming(db, eventId, tom, now))!.named).toEqual({ at: now, by: "Tom Hale" });
  });

  it("is for Committee, once per Match, and not for a Cancelled or started Match", async () => {
    const db = await setup();
    const eventId = await picked(db);
    expect((await nameTheTeam(db, { eventId, viewer: sam }, now)).ok).toBe(false);
    expect((await nameTheTeam(db, { eventId, viewer: tom }, now)).ok).toBe(true);
    expect(await nameTheTeam(db, { eventId, viewer: tom }, now)).toEqual({ ok: false, error: "This team has already been notified." });

    const cancelled = await makeMatch(db, "2026-10-04T13:00:00Z", "2nd XV");
    await pickPlayer(db, { eventId: cancelled, shirt: 1, userId: "kit", viewer: tom }, now);
    await cancelEvent(db, cancelled);
    expect((await nameTheTeam(db, { eventId: cancelled, viewer: tom }, now)).ok).toBe(false);

    const started = await makeMatch(db, "2026-10-01T10:00:00Z", "2nd XV");
    expect((await nameTheTeam(db, { eventId: started, viewer: tom }, now)).ok).toBe(false);
  });

  it("needs someone picked", async () => {
    const db = await setup();
    const eventId = await makeMatch(db);
    expect(await nameTheTeam(db, { eventId, viewer: tom }, now)).toEqual({ ok: false, error: "Pick the team first." });
  });

  it("lists what's missing for the confirm, and who has been named", async () => {
    const db = await setup();
    const eventId = await picked(db);
    const before = await getNaming(db, eventId, tom, now);
    expect(before!.named).toBeNull();
    expect(before!.canName).toBe(true);
    expect(before!.missing).toEqual(expect.arrayContaining(["No captain", "Sam Patel hasn't replied"]));
    expect(await getNaming(db, eventId, sam, now)).toBeNull();
  });

  it("says who it didn't reach, until Committee dismiss it", async () => {
    const db = await setup();
    const eventId = await picked(db);
    const result = await nameTheTeam(db, { eventId, viewer: tom }, now);
    const noticeId = result.ok ? result.noticeId! : "";
    expect(await getNotice(db, noticeId, tom, now)).toMatchObject({ status: "sending", total: 2, sent: 0 });

    const { mail } = fakeMail(["jo@x.org"]);
    const delivered = await deliverNotice(db, noticeId, { url: url(eventId), mail }, now);
    expect(delivered.reached.map((r) => r.userId)).toEqual(["sam"]);
    expect(await getNotice(db, noticeId, tom, now)).toMatchObject({ status: "failed", total: 2, sent: 1, missed: ["Jo King"] });
    expect((await getNaming(db, eventId, tom, now))!.notices.map((n) => n.id)).toEqual([noticeId]);

    await dismissNotice(db, noticeId, tom, now);
    expect((await getNaming(db, eventId, tom, now))!.notices).toEqual([]);
  });

  it("retries a failed notice for just the people it missed", async () => {
    const db = await setup();
    const eventId = await picked(db);
    const result = await nameTheTeam(db, { eventId, viewer: tom }, now);
    const noticeId = result.ok ? result.noticeId! : "";
    await deliverNotice(db, noticeId, { url: url(eventId), mail: fakeMail(["jo@x.org"]).mail }, now);

    expect(await retryNotice(db, noticeId, sam, now)).toEqual({ ok: false, error: "Only committee can do that." });
    expect(await retryNotice(db, noticeId, tom, now)).toEqual({ ok: true, noticeId, sending: 1 });
    expect(await getNotice(db, noticeId, tom, now)).toMatchObject({ status: "sending", total: 2, sent: 1, missed: [] });

    const retry = fakeMail();
    const delivered = await deliverNotice(db, noticeId, { url: url(eventId), mail: retry.mail }, now);
    expect(retry.sent.map((m) => m.to)).toEqual(["jo@x.org"]);
    expect(delivered.reached.map((r) => r.userId)).toEqual(["jo"]);
    expect(await getNotice(db, noticeId, tom, now)).toMatchObject({ status: "sent", total: 2, sent: 2, missed: [] });
    expect(await retryNotice(db, noticeId, tom, now)).toEqual({ ok: false, error: "That one isn't waiting to be retried." });
  });
});

describe("Send changes", () => {
  it("holds edits as unsent changes until sent, then tells only who is affected", async () => {
    const db = await setup();
    const { eventId } = await named(db);
    expect((await getNaming(db, eventId, tom, now))!.unsent).toEqual({ count: 0, lines: [] });

    await pickPlayer(db, { eventId, shirt: 3, userId: "sam", viewer: tom }, now); // moved
    await pickPlayer(db, { eventId, shirt: 4, userId: "kit", viewer: tom }, now); // kit in, jo dropped
    const naming = (await getNaming(db, eventId, tom, now))!;
    expect(naming.unsent.count).toBe(3);
    expect(naming.unsent.lines).toEqual(expect.arrayContaining(["Sam Patel moves to 3", "Kit Lane comes in at 4", "Jo King is dropped"]));

    const result = await sendChanges(db, { eventId, viewer: tom }, now);
    expect(result).toEqual({ ok: true, noticeId: expect.any(String), sending: 3 });
    const { mail, sent } = fakeMail();
    await deliverNotice(db, result.ok ? result.noticeId! : "", { url: url(eventId), mail }, now);
    expect(sent.map((m) => [m.to, m.subject]).sort()).toEqual([
      ["jo@x.org", "You're out of the 1st XV"],
      ["kit@x.org", "You're in the 1st XV"],
      ["sam@x.org", "You've moved in the 1st XV"],
    ]);
    expect(sent.find((m) => m.to === "jo@x.org")!.text).toContain("You're no longer in the 1st XV team for Sat 3 Oct.");
    expect((await getNaming(db, eventId, tom, now))!.unsent.count).toBe(0);
  });

  it("tells nobody when only a Guest or a Match Day Role changed, but updates the card", async () => {
    const db = await setup();
    const { eventId } = await named(db);
    await setRoles(db, { eventId, shirt: 4, roles: ["C"], viewer: tom }, now);
    expect((await getNaming(db, eventId, tom, now))!.unsent.count).toBe(1);
    expect((await getTeamCard(db, eventId, sam, now))!.layout.rows.find((r) => r.shirt === 4)!.roles).toBe("");

    expect(await sendChanges(db, { eventId, viewer: tom }, now)).toEqual({ ok: true, noticeId: null, sending: 0 });
    expect((await getTeamCard(db, eventId, sam, now))!.layout.rows.find((r) => r.shirt === 4)!.roles).toBe("C");
  });

  it("needs a named team and Committee", async () => {
    const db = await setup();
    const eventId = await picked(db);
    expect((await sendChanges(db, { eventId, viewer: tom }, now)).ok).toBe(false);
    await nameTheTeam(db, { eventId, viewer: tom }, now);
    expect((await sendChanges(db, { eventId, viewer: sam }, now)).ok).toBe(false);
  });
});

describe("getTeamCard", () => {
  it("shows nothing until the team is named, then what was last sent to everyone signed in", async () => {
    const db = await setup();
    const eventId = await picked(db);
    expect(await getTeamCard(db, eventId, sam, now)).toBeNull();

    await nameTheTeam(db, { eventId, viewer: tom }, now);
    await pickPlayer(db, { eventId, shirt: 4, userId: "kit", viewer: tom }, now); // unsent

    const card = (await getTeamCard(db, eventId, sam, now))!;
    expect(card.label).toBe("1st XV");
    expect(card.layout.title).toBe("IMRFC 1st XV vs Barts");
    expect(card.layout.rows.map((r) => [r.shirt, r.name])).toEqual([
      [2, "Sam Patel"],
      [4, "Jo King"],
      [5, "Ringer"],
    ]);
    expect(card.named).toEqual({ at: now, by: "Tom Hale" });
    expect(card.mine).toBe(2);
    expect((await getTeamCard(db, eventId, { id: "kit", committee: false }, now))!.mine).toBeNull();
  });
});

describe("listPlayingFor", () => {
  it("is a named Player's Match until it starts, and not once Cancelled", async () => {
    const db = await setup();
    const { eventId } = await named(db);
    await pickPlayer(db, { eventId, shirt: 19, userId: "kit", viewer: tom }, now);
    await sendChanges(db, { eventId, viewer: tom }, now);

    expect(await listPlayingFor(db, "sam", now)).toEqual([{ eventId, label: "1st XV", start: new Date("2026-10-03T13:30:00Z"), shirt: 2, bench: false }]);
    expect((await listPlayingFor(db, "kit", now))[0]).toMatchObject({ shirt: 19, bench: true });
    expect(await listPlayingFor(db, "tom", now)).toEqual([]);
    expect(await listPlayingFor(db, "sam", new Date("2026-10-03T14:00:00Z"))).toEqual([]);

    await cancelEvent(db, eventId);
    expect(await listPlayingFor(db, "sam", now)).toEqual([]);
  });

  it("leaves out a Player dropped but not yet told only once changes are sent", async () => {
    const db = await setup();
    const { eventId } = await named(db);
    await pickPlayer(db, { eventId, shirt: 4, userId: "kit", viewer: tom }, now);
    expect((await listPlayingFor(db, "jo", now)).length).toBe(1);
    await sendChanges(db, { eventId, viewer: tom }, now);
    expect(await listPlayingFor(db, "jo", now)).toEqual([]);
  });
});

describe("alertOnNotAvailable", () => {
  it("tells Committee when a picked Player replies Not available after the team is named", async () => {
    const db = await setup();
    const { eventId } = await named(db);
    await saveReply(db, { eventId, playerId: "sam", viewer: sam, status: "not_available", note: "", reason: "Exams" }, now);

    expect(await alertOnNotAvailable(db, { eventId, playerId: "sam" }, now)).toEqual({
      userIds: ["ann", "tom"],
      title: "Sam can't make it",
      body: "Sam can't make Sat 3 Oct: at 2 for the 1st XV.",
      eventId,
    });
  });

  it("stays quiet before naming, for someone not picked, and once the Match has started", async () => {
    const db = await setup();
    const eventId = await picked(db);
    expect(await alertOnNotAvailable(db, { eventId, playerId: "sam" }, now)).toBeNull();
    await nameTheTeam(db, { eventId, viewer: tom }, now);
    expect(await alertOnNotAvailable(db, { eventId, playerId: "kit" }, now)).toBeNull();
    expect(await alertOnNotAvailable(db, { eventId, playerId: "sam" }, new Date("2026-10-03T14:00:00Z"))).toBeNull();
  });
});
