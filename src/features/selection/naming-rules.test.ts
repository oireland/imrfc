import { describe, expect, it } from "vitest";
import { committeeAlert, diffNamed, noticeMessage, type Slot } from "./naming-rules";

const player = (shirt: number, userId: string, roles: string[] = []): Slot => ({ shirt, userId, guestName: null, roles });
const guest = (shirt: number, guestName: string): Slot => ({ shirt, userId: null, guestName, roles: [] });

describe("diffNamed", () => {
  it("has nothing to send when the board matches what was sent", () => {
    expect(diffNamed([player(1, "sam"), guest(2, "Ringer")], [player(1, "sam"), guest(2, "Ringer")])).toEqual({ changes: [], unsent: 0 });
  });

  it("tells a Player who was added, moved Shirt or dropped", () => {
    const sent = [player(1, "sam"), player(4, "jo"), player(9, "ray")];
    const current = [player(2, "sam"), player(4, "jo"), player(16, "kit")];
    const { changes } = diffNamed(sent, current);
    expect(changes).toEqual(
      expect.arrayContaining([
        { userId: "sam", kind: "moved", shirt: 2 },
        { userId: "kit", kind: "in", shirt: 16 },
        { userId: "ray", kind: "dropped", shirt: null },
      ]),
    );
    expect(changes).toHaveLength(3);
  });

  it("counts one unsent change per person, plus Guest and role edits that tell nobody", () => {
    const sent = [player(1, "sam"), player(4, "jo"), guest(5, "Ringer")];
    const current = [player(2, "sam"), player(4, "jo", ["C"]), guest(5, "Someone else")];
    const diff = diffNamed(sent, current);
    expect(diff.changes).toEqual([{ userId: "sam", kind: "moved", shirt: 2 }]);
    expect(diff.unsent).toBe(3);
  });

  it("treats a swap as each Player moving", () => {
    const { changes, unsent } = diffNamed([player(1, "sam"), player(2, "jo")], [player(1, "jo"), player(2, "sam")]);
    expect(changes).toHaveLength(2);
    expect(unsent).toBe(2);
  });
});

describe("noticeMessage", () => {
  const where = { label: "1st XV", date: "Sat 4 Oct" };

  it("says someone is in, on a Shirt or the bench", () => {
    expect(noticeMessage({ kind: "in", shirt: 7 }, where)).toMatchObject({
      title: "You're in the 1st XV",
      body: "You're in the 1st XV for Sat 4 Oct, at 7 (Openside Flanker).",
    });
    expect(noticeMessage({ kind: "in", shirt: 19 }, where).body).toBe("You're in the 1st XV for Sat 4 Oct, on the bench (19).");
  });

  it("says someone has moved or been dropped", () => {
    expect(noticeMessage({ kind: "moved", shirt: 12 }, where).body).toBe("You've moved in the 1st XV for Sat 4 Oct: you're now at 12 (Inside Centre).");
    expect(noticeMessage({ kind: "dropped", shirt: null }, where)).toMatchObject({
      title: "You're out of the 1st XV",
      body: "You're no longer in the 1st XV team for Sat 4 Oct.",
    });
  });
});

describe("committeeAlert", () => {
  it("names who pulled out and where they were", () => {
    expect(committeeAlert({ name: "Sam Patel", shirt: 4, label: "1st XV", date: "Sat 4 Oct" })).toEqual({
      title: "Sam can't make it",
      body: "Sam can't make Sat 4 Oct: at 4 for the 1st XV.",
    });
  });
});
