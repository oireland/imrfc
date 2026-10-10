import { describe, expect, it } from "vitest";
import { listPlayers, summarizePlayers, type PlayerRow } from "./list-rules";

const player = (overrides: Partial<PlayerRow>): PlayerRow => ({
  id: overrides.id ?? crypto.randomUUID(),
  name: "Someone",
  preferredPosition: null,
  playing: true,
  away: false,
  awayLabel: null,
  fitness: null,
  injuryLine: null,
  checkIn: null,
  isNew: false,
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

describe("listPlayers — Away", () => {
  const players = [
    player({ name: "Away Ann", away: true, awayLabel: "Away until 3 Nov" }),
    player({ name: "Soon Sid", away: false, awayLabel: "Away from 20 Dec" }),
    player({ name: "Here Hal" }),
  ];

  it("keeps Away Players in their place in the list", () => {
    expect(listPlayers(players).playing.map((p) => p.name)).toEqual(["Away Ann", "Here Hal", "Soon Sid"]);
  });

  it("narrows to Players who are Away now or coming up with the Away filter", () => {
    expect(listPlayers(players, "", { awayOnly: true }).playing.map((p) => p.name)).toEqual(["Away Ann", "Soon Sid"]);
  });
});

describe("summarizePlayers", () => {
  it("counts who is Away now, leaving out zero parts", () => {
    expect(summarizePlayers([player({ away: true }), player({ away: true }), player({})])).toBe("2 away");
    expect(summarizePlayers([player({})])).toBe("");
  });

  it("ignores Players with Playing off", () => {
    expect(summarizePlayers([player({ away: true, playing: false })])).toBe("");
  });

  it("counts Fitness too, worst first", () => {
    const players = [
      player({ fitness: "out" }),
      player({ fitness: "out" }),
      player({ fitness: "out" }),
      player({ fitness: "training_only" }),
      player({ fitness: "playing_through" }),
      player({ fitness: "playing_through" }),
      player({ away: true }),
      player({ away: true }),
      player({}),
    ];
    expect(summarizePlayers(players)).toBe("3 out · 1 training only · 2 playing through it · 2 away");
  });
});

describe("listPlayers — Injured", () => {
  const players = [
    player({ name: "Hurt Hal", fitness: "out" }),
    player({ name: "Carrying Cat", fitness: "playing_through" }),
    player({ name: "Fit Fran" }),
  ];

  it("narrows to Players with an open Injury with the Injured filter", () => {
    expect(listPlayers(players, "", { injuredOnly: true }).playing.map((p) => p.name)).toEqual(["Carrying Cat", "Hurt Hal"]);
  });

  it("combines with the Away filter as either", () => {
    const withAway = [...players, player({ name: "Away Ann", awayLabel: "Away until 3 Nov", away: true })];
    expect(listPlayers(withAway, "", { injuredOnly: true, awayOnly: true }).playing.map((p) => p.name)).toEqual([
      "Away Ann",
      "Carrying Cat",
      "Hurt Hal",
    ]);
  });
});
