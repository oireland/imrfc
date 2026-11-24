import { describe, expect, it } from "vitest";
import { shareMessage, type ShareEvent } from "./share-rules";

const url = "https://app.imrfc.co.uk/events/e1";
const training: ShareEvent = {
  title: "Training @ Kings House",
  start: new Date("2026-11-30T17:15:00Z"),
  end: new Date("2026-11-30T19:00:00Z"),
  startTbc: false,
  venue: "Kings House",
  meetTime: null,
  travelMeetTime: null,
  travelMeetPoint: null,
};
const barts: ShareEvent = {
  title: "1st XV v Barts",
  start: new Date("2026-10-03T13:00:00Z"), // 14:00 BST
  end: new Date("2026-10-03T15:00:00Z"),
  startTbc: false,
  venue: "Barts Sports Ground",
  meetTime: new Date("2026-10-03T12:00:00Z"),
  travelMeetTime: new Date("2026-10-03T10:30:00Z"),
  travelMeetPoint: "Union Bar",
};

describe("shareMessage", () => {
  it("asks for availability with the title, same-day times, venue and a link", () => {
    expect(shareMessage({ events: [training], replyBy: null, url })).toBe(
      [
        "Availability time fellas:",
        "",
        "Training @ Kings House",
        "Mon 30 Nov, 17:15–19:00",
        "Venue: Kings House",
        "",
        `Reply on the app: ${url}`,
      ].join("\n"),
    );
  });

  it("gives a Match's meet times in London time, with the transport meet point", () => {
    const text = shareMessage({ events: [barts], replyBy: null, url });
    expect(text).toContain("Sat 3 Oct, 14:00–16:00");
    expect(text).toContain("Meet at venue: 13:00");
    expect(text).toContain("Transport meet: 11:30 at Union Bar");
  });

  it("leaves out meet times a Match hasn't set", () => {
    const text = shareMessage({ events: [{ ...barts, meetTime: null, travelMeetTime: null }], replyBy: null, url });
    expect(text).not.toContain("Meet at venue");
    expect(text).not.toContain("Transport meet");
  });

  it("shows the end's date when the Event runs past midnight", () => {
    const late = { ...training, end: new Date("2026-12-01T00:30:00Z") };
    expect(shareMessage({ events: [late], replyBy: null, url })).toContain("Mon 30 Nov, 17:15 – Tue 1 Dec, 00:30");
  });

  it("says when the start time isn't set yet", () => {
    expect(shareMessage({ events: [{ ...training, startTbc: true }], replyBy: null, url })).toContain("Mon 30 Nov, time TBC");
  });

  it("lists every Match that day, then the Reply By", () => {
    const ucl = { ...barts, title: "2nd XV v UCL", venue: null, meetTime: null, travelMeetTime: null, travelMeetPoint: null };
    const text = shareMessage({ events: [barts, ucl], replyBy: new Date("2026-10-02T17:00:00Z"), url });
    expect(text.indexOf("1st XV v Barts")).toBeLessThan(text.indexOf("2nd XV v UCL"));
    expect(text).toContain("Reply by Fri 2 Oct, 18:00.");
  });
});
