import { describe, expect, it } from "vitest";
import { dutyActions, type DutyState } from "./duty-actions-rules";

const duty = (over: Partial<DutyState> = {}): DutyState => ({
  direction: "to",
  userIds: [],
  confirmed: false,
  voided: false,
  ...over,
});

describe("dutyActions", () => {
  it("lets anyone claim a Duty nobody is doing", () => {
    expect(dutyActions(duty(), { viewerId: "sam", committee: false })).toEqual(["claim"]);
  });

  it("lets the person doing it confirm, leave or hand it on", () => {
    expect(dutyActions(duty({ userIds: ["sam"] }), { viewerId: "sam", committee: false })).toEqual([
      "confirm",
      "leave",
      "handOn",
      "setShare",
    ]);
  });

  it("lets anyone join a Duty that already has other People on it", () => {
    expect(dutyActions(duty({ userIds: ["tom"] }), { viewerId: "sam", committee: false })).toEqual(["claim"]);
  });

  it("gives someone on it who isn't Committee no hand-on once Committee is on it too, only leave and confirm", () => {
    expect(dutyActions(duty({ userIds: ["sam", "tom"] }), { viewerId: "sam", committee: false })).toEqual([
      "confirm",
      "leave",
      "handOn",
      "setShare",
    ]);
  });

  it("lets Committee assign (add or remove anyone), confirm, and set where equipment goes back to", () => {
    expect(dutyActions(duty(), { viewerId: "priya", committee: true })).toEqual(["claim", "assign"]);
    expect(dutyActions(duty({ userIds: ["tom"] }), { viewerId: "priya", committee: true })).toEqual(["claim", "confirm", "assign"]);
    expect(dutyActions(duty({ direction: "from", userIds: ["sam"] }), { viewerId: "sam", committee: true })).toEqual([
      "confirm",
      "leave",
      "setShare",
      "assign",
      "setDestination",
    ]);
  });

  it("leaves nothing to do once a Duty is Confirmed or voided", () => {
    expect(dutyActions(duty({ userIds: ["sam"], confirmed: true }), { viewerId: "sam", committee: true })).toEqual([]);
    expect(dutyActions(duty({ voided: true }), { viewerId: "sam", committee: true })).toEqual([]);
  });

  it("once your own part is done, you can't leave, hand on or change it", () => {
    const state = duty({ userIds: ["sam", "tom"], doneUserIds: ["sam"] });
    expect(dutyActions(state, { viewerId: "sam", committee: false })).toEqual(["confirm"]);
    expect(dutyActions(state, { viewerId: "tom", committee: false })).toEqual(["confirm", "leave", "handOn", "setShare"]);
  });

  it("lets the person doing it change how many they're taking", () => {
    expect(dutyActions(duty({ userIds: ["sam"] }), { viewerId: "sam", committee: false })).toContain("setShare");
    expect(dutyActions(duty({ userIds: ["sam"] }), { viewerId: "tom", committee: false })).not.toContain("setShare");
  });
});
