import { describe, expect, it } from "vitest";
import { findHeadsUps } from "./heads-up-rules";
import type { PlanEvent, PlanKit } from "./plan";

const at = (iso: string) => new Date(iso);
const now = at("2026-10-01T09:00:00Z");
const names: Record<string, string> = { tom: "Tom Reed", sam: "Sam Okafor" };
const personName = (id: string) => names[id];

const kit = (over: Partial<PlanKit> = {}): PlanKit => ({
  id: "shields",
  name: "Tackle Shields",
  status: "active",
  holderId: null,
  ...over,
});

const event = (over: Partial<PlanEvent> = {}): PlanEvent => ({
  id: "e1",
  title: "Alumni Day",
  start: at("2026-10-20T13:00:00Z"),
  end: at("2026-10-20T17:00:00Z"),
  kitUnitIds: ["shields"],
  duties: [
    { kitUnitId: "shields", direction: "to", userId: "tom" },
    { kitUnitId: "shields", direction: "from", userId: "tom" },
  ],
  ...over,
});

const tomorrow = { start: at("2026-10-02T13:00:00Z"), end: at("2026-10-02T17:00:00Z") };
const messages = (kitUnits: PlanKit[], events: PlanEvent[]) =>
  findHeadsUps({ now, kit: kitUnits, events, personName }).map((h) => h.message);

describe("findHeadsUps", () => {
  it("has nothing to say when the plan looks right", () => {
    expect(findHeadsUps({ now, kit: [kit()], events: [event()], personName })).toEqual([]);
  });

  it("says nobody is taking the kit to the Event when it starts within 48 hours", () => {
    const soon = event({ ...tomorrow, duties: [{ kitUnitId: "shields", direction: "from", userId: "tom" }] });

    expect(findHeadsUps({ now, kit: [kit()], events: [soon], personName })).toEqual([
      {
        kind: "unfilled_duty",
        kitUnitId: "shields",
        eventIds: ["e1"],
        message: "Nobody is taking Tackle Shields to Alumni Day, and it starts within 48 hours.",
      },
    ]);
  });

  it("says nobody is taking the kit back from the Event", () => {
    const soon = event({ ...tomorrow, duties: [{ kitUnitId: "shields", direction: "to", userId: "tom" }] });

    expect(messages([kit()], [soon])).toEqual([
      "Nobody is taking Tackle Shields back from Alumni Day, and it starts within 48 hours.",
    ]);
  });

  it("says it once when nobody is taking the kit either way", () => {
    expect(messages([kit()], [event({ ...tomorrow, duties: [] })])).toEqual([
      "Nobody is taking Tackle Shields to or back from Alumni Day, and it starts within 48 hours.",
    ]);
  });

  it("stays quiet about unfilled Duties more than 48 hours out", () => {
    expect(messages([kit()], [event({ duties: [] })])).toEqual([]);
  });

  it("says when kit on the Checklist is Missing or Retired", () => {
    expect(messages([kit({ status: "missing" })], [event()])).toEqual([
      "Tackle Shields is on the list for Alumni Day but has been marked missing.",
    ]);
    expect(messages([kit({ status: "retired" })], [event()])).toEqual([
      "Tackle Shields is on the list for Alumni Day but has been retired.",
    ]);
  });

  it("says the Holder needs to pass the kit on when someone else is bringing it to the next Event", () => {
    expect(findHeadsUps({ now, kit: [kit({ holderId: "sam" })], events: [event()], personName })).toEqual([
      {
        kind: "pass_on",
        kitUnitId: "shields",
        eventIds: ["e1"],
        message: "Sam Okafor needs to pass Tackle Shields to Tom Reed before Alumni Day.",
      },
    ]);
  });

  it("doesn't ask the Holder to pass kit on when nobody is bringing it yet", () => {
    const unfilled = event({ duties: [] });

    expect(messages([kit({ holderId: "sam" })], [unfilled])).toEqual([]);
  });
});
