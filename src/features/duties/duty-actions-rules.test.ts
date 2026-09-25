import { describe, expect, it } from "vitest";
import { dutyActions, type DutyState } from "./duty-actions-rules";

const duty = (over: Partial<DutyState> = {}): DutyState => ({
  direction: "to",
  userId: null,
  confirmed: false,
  voided: false,
  ...over,
});

describe("dutyActions", () => {
  it("lets anyone claim a Duty nobody is doing", () => {
    expect(dutyActions(duty(), { viewerId: "sam", committee: false })).toEqual(["claim"]);
  });

  it("lets the person doing it mark it done or hand it on", () => {
    expect(dutyActions(duty({ userId: "sam" }), { viewerId: "sam", committee: false })).toEqual(["confirm", "handOn"]);
  });

  it("gives someone else's Duty nothing to do for a Member", () => {
    expect(dutyActions(duty({ userId: "tom" }), { viewerId: "sam", committee: false })).toEqual([]);
  });

  it("lets Committee assign, confirm and unassign any Duty, and set where kit goes back to", () => {
    expect(dutyActions(duty(), { viewerId: "sam", committee: true })).toEqual(["claim", "assign"]);
    expect(dutyActions(duty({ userId: "tom" }), { viewerId: "sam", committee: true })).toEqual([
      "confirm",
      "assign",
      "unassign",
    ]);
    expect(dutyActions(duty({ direction: "from", userId: "sam" }), { viewerId: "sam", committee: true })).toEqual([
      "confirm",
      "assign",
      "unassign",
      "setDestination",
    ]);
  });

  it("leaves nothing to do once a Duty is Confirmed or voided", () => {
    expect(dutyActions(duty({ userId: "sam", confirmed: true }), { viewerId: "sam", committee: true })).toEqual([]);
    expect(dutyActions(duty({ voided: true }), { viewerId: "sam", committee: true })).toEqual([]);
  });
});
