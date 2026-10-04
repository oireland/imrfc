import { describe, expect, it } from "vitest";
import { fitFor, positionOfShirt, sortForShirt, type Candidate } from "./shirts";

const player = (id: string, preferred: Candidate["preferredPosition"], other: Candidate["otherPositions"] = []): Candidate => ({
  id,
  name: id,
  preferredPosition: preferred,
  otherPositions: other,
});

describe("positionOfShirt", () => {
  it("maps the starting Shirts to Positions and leaves the bench open", () => {
    expect(positionOfShirt(1)).toBe("Loosehead Prop");
    expect(positionOfShirt(4)).toBe("Lock");
    expect(positionOfShirt(5)).toBe("Lock");
    expect(positionOfShirt(11)).toBe("Wing");
    expect(positionOfShirt(14)).toBe("Wing");
    expect(positionOfShirt(15)).toBe("Fullback");
    expect(positionOfShirt(16)).toBeNull();
    expect(positionOfShirt(24)).toBeNull();
  });
});

describe("fitFor", () => {
  it("ranks Preferred, then Other, then the paired position as cover, then the rest", () => {
    expect(fitFor(6, player("a", "Blindside Flanker"))).toBe("preferred");
    expect(fitFor(6, player("b", "Number 8", ["Blindside Flanker"]))).toBe("other");
    expect(fitFor(6, player("c", "Openside Flanker"))).toBe("cover");
    expect(fitFor(7, player("d", "Blindside Flanker"))).toBe("cover");
    expect(fitFor(12, player("e", "Outside Centre"))).toBe("cover");
    expect(fitFor(13, player("f", "Inside Centre"))).toBe("cover");
    expect(fitFor(6, player("g", "Hooker"))).toBe("rest");
    expect(fitFor(6, player("h", null))).toBe("rest");
  });

  it("counts a paired position among Other Positions as cover too", () => {
    expect(fitFor(7, player("a", "Number 8", ["Blindside Flanker"]))).toBe("cover");
  });

  it("never calls anyone out of position on the bench", () => {
    expect(fitFor(18, player("a", "Hooker"))).toBe("bench");
  });
});

describe("sortForShirt", () => {
  it("lists Preferred first, then Other, cover and the rest, each by name", () => {
    const sorted = sortForShirt(4, [
      player("zed", "Hooker"),
      player("cat", "Lock"),
      player("amy", "Number 8", ["Lock"]),
      player("bob", "Lock"),
    ]);
    expect(sorted.map((s) => [s.candidate.id, s.fit])).toEqual([
      ["bob", "preferred"],
      ["cat", "preferred"],
      ["amy", "other"],
      ["zed", "rest"],
    ]);
  });

  it("sorts the bench by Position order", () => {
    const sorted = sortForShirt(17, [player("a", "Fullback"), player("b", "Hooker"), player("c", null)]);
    expect(sorted.map((s) => s.candidate.id)).toEqual(["b", "a", "c"]);
  });
});
