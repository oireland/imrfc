import { describe, expect, it } from "vitest";
import { applyOptimistic } from "./optimistic";
import type { Board, Role } from "./index";

const shirt = (n: number, occupant: Board["pitches"][0]["shirts"][0]["occupant"] = null) => ({
  shirt: n,
  position: null,
  occupant,
  roles: [] as Role[],
  changedBy: null,
  changedAt: null,
});

const board = (): Board => ({
  pitches: [
    { eventId: "a", label: "1st XV", title: "A", start: new Date(), readOnly: false, shirts: [shirt(1), shirt(2), shirt(16)] },
    { eventId: "b", label: "2nd XV", title: "B", start: new Date(), readOnly: false, shirts: [shirt(1), shirt(2)] },
  ],
  candidates: [
    { id: "tom", name: "Tom", preferredPosition: "Loosehead Prop", otherPositions: [], availability: "available" },
    { id: "ann", name: "Ann", preferredPosition: "Hooker", otherPositions: [], availability: "no_reply" },
  ],
});

const occ = (b: Board, eventId: string, n: number) => b.pitches.find((p) => p.eventId === eventId)!.shirts.find((s) => s.shirt === n)!.occupant;

describe("applyOptimistic", () => {
  it("puts a picked Player on the Shirt with their fit and availability", () => {
    const next = applyOptimistic(board(), { type: "pick", eventId: "a", shirt: 1, userId: "tom" });
    expect(occ(next, "a", 1)).toEqual({ kind: "player", userId: "tom", name: "Tom", fit: "preferred", availability: "available" });
  });

  it("moves a Player off the Shirt they were on, across the day's pitches", () => {
    const start = applyOptimistic(board(), { type: "pick", eventId: "a", shirt: 1, userId: "tom" });
    const next = applyOptimistic(start, { type: "pick", eventId: "b", shirt: 2, userId: "tom" });
    expect(occ(next, "a", 1)).toBeNull();
    expect(occ(next, "b", 2)).toMatchObject({ userId: "tom", fit: "rest" });
  });

  it("types a Guest onto a Shirt and clears a Shirt", () => {
    const withGuest = applyOptimistic(board(), { type: "guest", eventId: "a", shirt: 16, name: " Sam " });
    expect(occ(withGuest, "a", 16)).toEqual({ kind: "guest", name: "Sam" });
    expect(occ(applyOptimistic(withGuest, { type: "clear", eventId: "a", shirt: 16 }), "a", 16)).toBeNull();
  });

  it("swaps two Shirts, including with an empty one", () => {
    const start = applyOptimistic(board(), { type: "pick", eventId: "a", shirt: 1, userId: "tom" });
    const next = applyOptimistic(start, { type: "swap", from: { eventId: "a", shirt: 1 }, to: { eventId: "a", shirt: 2 } });
    expect(occ(next, "a", 1)).toBeNull();
    expect(occ(next, "a", 2)).toMatchObject({ userId: "tom", fit: "rest" });
  });

  it("sets a Shirt's roles, moves them with the Player on a swap, and drops them when the Shirt changes hands", () => {
    const tomOn1 = applyOptimistic(board(), { type: "pick", eventId: "a", shirt: 1, userId: "tom" });
    const withRoles = applyOptimistic(tomOn1, { type: "roles", eventId: "a", shirt: 1, roles: ["C", "KD"] });
    const rolesAt = (b: Board, n: number) => b.pitches[0].shirts.find((s) => s.shirt === n)!.roles;
    expect(rolesAt(withRoles, 1)).toEqual(["C", "KD"]);

    const swapped = applyOptimistic(withRoles, { type: "swap", from: { eventId: "a", shirt: 1 }, to: { eventId: "a", shirt: 2 } });
    expect(rolesAt(swapped, 1)).toEqual([]);
    expect(rolesAt(swapped, 2)).toEqual(["C", "KD"]);

    expect(rolesAt(applyOptimistic(withRoles, { type: "pick", eventId: "a", shirt: 1, userId: "ann" }), 1)).toEqual([]);
    expect(rolesAt(applyOptimistic(withRoles, { type: "clear", eventId: "a", shirt: 1 }), 1)).toEqual([]);
  });

  it("moves C or VC off whoever else held it", () => {
    let b = applyOptimistic(board(), { type: "pick", eventId: "a", shirt: 1, userId: "tom" });
    b = applyOptimistic(b, { type: "pick", eventId: "a", shirt: 2, userId: "ann" });
    b = applyOptimistic(b, { type: "roles", eventId: "a", shirt: 1, roles: ["C", "HT"] });
    b = applyOptimistic(b, { type: "roles", eventId: "a", shirt: 2, roles: ["C"] });
    expect(b.pitches[0].shirts.find((s) => s.shirt === 1)!.roles).toEqual(["HT"]);
  });

  it("doesn't change the board it was given", () => {
    const start = board();
    applyOptimistic(start, { type: "pick", eventId: "a", shirt: 1, userId: "tom" });
    expect(occ(start, "a", 1)).toBeNull();
  });
});
