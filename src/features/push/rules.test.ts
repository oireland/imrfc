import { describe, expect, it } from "vitest";
import { morningOfMessage, morningOfRecipients, type MorningOfEvent } from "./rules";

const training: MorningOfEvent = { id: "e1", title: "1sts & 2nds Training", start: new Date("2026-10-01T18:00:00Z") };
const match: MorningOfEvent = { id: "e2", title: "1st XV v Barts", start: new Date("2026-10-01T14:00:00Z") };

describe("morningOfRecipients", () => {
  it("gives one entry per User, listing which of today's Events put them there and why", () => {
    const recipients = morningOfRecipients({
      events: [training, match],
      dutyUserIds: new Map([["e1", new Set(["tom"])]]),
      availableUserIds: new Map([["e2", new Set(["tom", "sam"])]]),
    });

    expect(recipients.get("tom")).toEqual({ duty: ["1sts & 2nds Training"], available: ["1st XV v Barts"] });
    expect(recipients.get("sam")).toEqual({ duty: [], available: ["1st XV v Barts"] });
    expect(recipients.size).toBe(2);
  });

  it("returns nothing when nobody has a Duty or an Available reply today", () => {
    expect(morningOfRecipients({ events: [training], dutyUserIds: new Map(), availableUserIds: new Map() }).size).toBe(0);
  });
});

describe("morningOfMessage", () => {
  it("names the Event when there's a single reason", () => {
    expect(morningOfMessage({ duty: ["1sts & 2nds Training"], available: [] })).toEqual({
      title: "Today: 1sts & 2nds Training",
      body: "You're on duty for it.",
    });
    expect(morningOfMessage({ duty: [], available: ["1st XV v Barts"] })).toEqual({
      title: "Today: 1st XV v Barts",
      body: "You said you're in — see you there.",
    });
  });

  it("combines several reasons into one summary", () => {
    expect(morningOfMessage({ duty: ["Training"], available: ["Training", "1st XV v Barts"] })).toEqual({
      title: "Today",
      body: "You're on duty for Training. You're in for Training, 1st XV v Barts.",
    });
  });
});
