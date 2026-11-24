import { describe, expect, it } from "vitest";
import { countToMove, holdersFromShares, pendingShares, unclaimed, validateShare, validateShares } from "./shares-rules";

const s = (userId: string, count: number | null) => ({ userId, count });

describe("unclaimed", () => {
  it("is the whole line when nobody is on it", () => expect(unclaimed(4, [])).toBe(4));
  it("takes off what People have claimed", () => expect(unclaimed(4, [s("tom", 2)])).toBe(2));
  it("is nothing once someone is on it without a number (they have all of it)", () =>
    expect(unclaimed(4, [s("tom", 2), s("sam", null)])).toBe(0));
});

describe("countToMove", () => {
  it("is only what's claimed when everyone gave a number", () => expect(countToMove(4, [s("tom", 2), s("sam", 1)])).toBe(3));
  it("is the whole line when anyone didn't", () => expect(countToMove(4, [s("tom", 2), s("sam", null)])).toBe(4));
  it("is the whole line when nobody is on it", () => expect(countToMove(4, [])).toBe(4));
});

describe("holdersFromShares", () => {
  it("is each Person's claim when everyone gave a number", () =>
    expect(holdersFromShares([s("tom", 2), s("sam", 1)])).toEqual([
      { userId: "tom", count: 2 },
      { userId: "sam", count: 1 },
    ]));
  it("is undefined when anyone didn't", () => expect(holdersFromShares([s("tom", 2), s("sam", null)])).toBeUndefined());
});

describe("validateShare", () => {
  it("accepts 1 up to what's unclaimed", () => {
    expect(validateShare(4, [s("tom", 2)], 2)).toEqual({ ok: true });
    expect(validateShare(4, [s("tom", 2)], 1)).toEqual({ ok: true });
  });
  it("refuses more than is unclaimed, zero, and fractions", () => {
    expect(validateShare(4, [s("tom", 2)], 3)).toEqual({ ok: false, error: "Only 2 left to take." });
    expect(validateShare(4, [], 0)).toMatchObject({ ok: false });
    expect(validateShare(4, [], 1.5)).toMatchObject({ ok: false });
  });
});

describe("pendingShares", () => {
  it("leaves out People already done when everyone gave a number", () =>
    expect(pendingShares([{ ...s("tom", 2), confirmed: true }, s("sam", 1)])).toEqual([s("sam", 1)]));
  it("is everyone when anyone has all of it", () =>
    expect(pendingShares([s("tom", null), s("sam", 1)])).toEqual([s("tom", null), s("sam", 1)]));
});

describe("validateShares", () => {
  it("accepts numbers that fit the line, or no numbers", () => {
    expect(validateShares(4, [s("tom", 2), s("sam", 2)])).toEqual({ ok: true });
    expect(validateShares(4, [s("tom", 2), s("sam", null)])).toEqual({ ok: true });
  });
  it("refuses more than the line, zero and fractions", () => {
    expect(validateShares(4, [s("tom", 3), s("sam", 2)])).toEqual({ ok: false, error: "That's more than the 4 needed." });
    expect(validateShares(4, [s("tom", 0)])).toMatchObject({ ok: false });
    expect(validateShares(4, [s("tom", 1.5)])).toMatchObject({ ok: false });
  });
});
