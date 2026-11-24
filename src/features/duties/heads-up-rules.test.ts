import { describe, expect, it } from "vitest";
import { findHeadsUps } from "./heads-up-rules";
import type { PlanEvent, PlanEquipment } from "./plan";

const at = (iso: string) => new Date(iso);
const now = at("2026-10-01T09:00:00Z");
const names: Record<string, string> = { tom: "Tom Reed", sam: "Sam Okafor" };
const personName = (id: string) => names[id];

const equipment = (over: Partial<PlanEquipment> = {}): PlanEquipment => ({
  id: "shields",
  name: "Tackle Shields",
  status: "active",
  quantity: 1,
  portions: [],
  ...over,
});

const event = (over: Partial<PlanEvent> = {}): PlanEvent => ({
  id: "e1",
  title: "Alumni Day",
  start: at("2026-10-20T13:00:00Z"),
  end: at("2026-10-20T17:00:00Z"),
  items: [{ equipmentUnitId: "shields", count: 1 }],
  duties: [
    { equipmentUnitId: "shields", direction: "to", userIds: ["tom"] },
    { equipmentUnitId: "shields", direction: "from", userIds: ["tom"] },
  ],
  ...over,
});

const tomorrow = { start: at("2026-10-02T13:00:00Z"), end: at("2026-10-02T17:00:00Z") };
const messages = (equipmentUnits: PlanEquipment[], events: PlanEvent[]) =>
  findHeadsUps({ now, equipment: equipmentUnits, events, personName }).map((h) => h.message);

describe("findHeadsUps", () => {
  it("has nothing to say when the plan looks right", () => {
    expect(findHeadsUps({ now, equipment: [equipment()], events: [event()], personName })).toEqual([]);
  });

  it("says only some are being taken when a Duty near the Event covers part of the count", () => {
    const soon = event({
      ...tomorrow,
      items: [{ equipmentUnitId: "shields", count: 4 }],
      duties: [
        { equipmentUnitId: "shields", direction: "to", userIds: ["tom"], shares: [2] },
        { equipmentUnitId: "shields", direction: "from", userIds: ["tom", "sam"], shares: [2, 2] },
      ],
    });

    expect(messages([equipment({ quantity: 4, portions: [{ storeId: "s", holderId: null, count: 4 }] })], [soon])).toEqual([
      "Only 2 of 4 Tackle Shields are being taken to Alumni Day, and it starts within 48 hours.",
    ]);
  });

  it("counts someone with no number as taking all of it", () => {
    const soon = event({
      ...tomorrow,
      items: [{ equipmentUnitId: "shields", count: 4 }],
      duties: [
        { equipmentUnitId: "shields", direction: "to", userIds: ["tom", "sam"], shares: [2, null] },
        { equipmentUnitId: "shields", direction: "from", userIds: ["tom"], shares: [null] },
      ],
    });

    expect(messages([equipment({ quantity: 4, portions: [{ storeId: "s", holderId: null, count: 4 }] })], [soon])).toEqual([]);
  });

  it("says nobody is taking the equipment to the Event when it starts within 48 hours", () => {
    const soon = event({ ...tomorrow, duties: [{ equipmentUnitId: "shields", direction: "from", userIds: ["tom"] }] });

    expect(findHeadsUps({ now, equipment: [equipment()], events: [soon], personName })).toEqual([
      {
        kind: "unfilled_duty",
        equipmentUnitId: "shields",
        eventIds: ["e1"],
        message: "Nobody is taking Tackle Shields to Alumni Day, and it starts within 48 hours.",
      },
    ]);
  });

  it("counts a TBC kick-off as the end of match day, so it isn't flagged until that day is within 48 hours", () => {
    // Match day is 3 Oct (BST): the day starts ~38h away but ends ~62h away.
    const tbc = event({
      start: at("2026-10-02T23:00:00Z"),
      end: at("2026-10-03T23:00:00Z"),
      startTbc: true,
      duties: [{ equipmentUnitId: "shields", direction: "from", userIds: ["tom"] }],
    });

    expect(messages([equipment()], [tbc])).toEqual([]);
  });

  it("says nobody is taking the equipment back from the Event", () => {
    const soon = event({ ...tomorrow, duties: [{ equipmentUnitId: "shields", direction: "to", userIds: ["tom"] }] });

    expect(messages([equipment()], [soon])).toEqual([
      "Nobody is taking Tackle Shields back from Alumni Day, and it starts within 48 hours.",
    ]);
  });

  it("says it once when nobody is taking the equipment either way", () => {
    expect(messages([equipment()], [event({ ...tomorrow, duties: [] })])).toEqual([
      "Nobody is taking Tackle Shields to or back from Alumni Day, and it starts within 48 hours.",
    ]);
  });

  it("stays quiet about unfilled Duties more than 48 hours out", () => {
    expect(messages([equipment()], [event({ duties: [] })])).toEqual([]);
  });

  it("says when equipment on the Checklist is Missing or Retired", () => {
    expect(messages([equipment({ status: "missing" })], [event()])).toEqual([
      "Tackle Shields is on the list for Alumni Day but has been marked missing.",
    ]);
    expect(messages([equipment({ status: "retired" })], [event()])).toEqual([
      "Tackle Shields is on the list for Alumni Day but has been retired.",
    ]);
  });

  it("says the Holder needs to pass the equipment on when someone else is bringing it to the next Event", () => {
    const shields = equipment({ portions: [{ storeId: null, holderId: "sam", count: 1 }] });
    expect(findHeadsUps({ now, equipment: [shields], events: [event()], personName })).toEqual([
      {
        kind: "pass_on",
        equipmentUnitId: "shields",
        eventIds: ["e1"],
        message: "Sam Okafor needs to pass Tackle Shields to Tom Reed before Alumni Day.",
      },
    ]);
  });

  it("doesn't ask the Holder to pass equipment on when nobody is bringing it yet", () => {
    const unfilled = event({ duties: [] });
    const shields = equipment({ portions: [{ storeId: null, holderId: "sam", count: 1 }] });

    expect(messages([shields], [unfilled])).toEqual([]);
  });

  describe("Quantity", () => {
    it("says nothing when the bringer already holds enough", () => {
      const shields = equipment({ quantity: 8, portions: [{ storeId: null, holderId: "tom", count: 4 }] });
      const soon = event({ items: [{ equipmentUnitId: "shields", count: 4 }] });

      expect(messages([shields], [soon])).toEqual([]);
    });

    it("says nothing when Stores plus what the bringer holds is enough", () => {
      const shields = equipment({
        quantity: 8,
        portions: [
          { storeId: "shed", holderId: null, count: 4 },
          { storeId: null, holderId: "tom", count: 2 },
        ],
      });
      const soon = event({ items: [{ equipmentUnitId: "shields", count: 6 }] });

      expect(messages([shields], [soon])).toEqual([]);
    });

    it("says the Holder needs to pass some on when the bringer can't get enough from Stores and their own", () => {
      const shields = equipment({
        quantity: 8,
        portions: [
          { storeId: null, holderId: "tom", count: 2 },
          { storeId: null, holderId: "sam", count: 6 },
        ],
      });
      const soon = event({ items: [{ equipmentUnitId: "shields", count: 6 }] });

      expect(messages([shields], [soon])).toEqual([
        "Sam Okafor needs to pass Tackle Shields to Tom Reed before Alumni Day.",
      ]);
    });
  });
});
