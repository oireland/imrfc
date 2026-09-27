import { describe, expect, it } from "vitest";
import { listPlayers, type PlayerRow } from "./list-rules";

const player = (overrides: Partial<PlayerRow>): PlayerRow => ({
  id: overrides.id ?? crypto.randomUUID(),
  name: "Someone",
  preferredPosition: null,
  playing: true,
  ...overrides,
});

describe("listPlayers", () => {
  it("orders Playing players by Preferred Position, undecided ones last", () => {
    const players = [
      player({ name: "Fly-half Fran", preferredPosition: "Fly-half" }),
      player({ name: "Hooker Hal", preferredPosition: "Hooker" }),
      player({ name: "Undecided Uma", preferredPosition: null }),
    ];
    expect(listPlayers(players).playing.map((p) => p.name)).toEqual(["Hooker Hal", "Fly-half Fran", "Undecided Uma"]);
  });

  it("splits Not playing players into their own group, still position-ordered", () => {
    const players = [
      player({ name: "Playing Pat", preferredPosition: "Hooker", playing: true }),
      player({ name: "Retired Ray", preferredPosition: "Fly-half", playing: false }),
    ];
    const listing = listPlayers(players);
    expect(listing.playing.map((p) => p.name)).toEqual(["Playing Pat"]);
    expect(listing.notPlaying.map((p) => p.name)).toEqual(["Retired Ray"]);
  });

  it("narrows to a case-insensitive name search across both groups", () => {
    const players = [
      player({ name: "Sam Smith", playing: true }),
      player({ name: "Priya Patel", playing: false }),
      player({ name: "Tom Jones", playing: true }),
    ];
    const listing = listPlayers(players, "sam");
    expect(listing.playing.map((p) => p.name)).toEqual(["Sam Smith"]);
    expect(listing.notPlaying).toEqual([]);
  });
});
