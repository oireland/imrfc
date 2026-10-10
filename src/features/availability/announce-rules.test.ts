import { describe, expect, it } from "vitest";
import { askPush, chaseMessage, askEmail, whatsappMessage } from "./announce-rules";

const barts = { title: "1st XV v Barts", start: new Date("2026-10-03T13:00:00Z") };
const ucl = { title: "2nd XV v UCL", start: new Date("2026-10-03T15:00:00Z") };
const url = "https://app.imrfc.co.uk/events/e1";

describe("askEmail", () => {
  it("asks whether they can make it, with a link to the Event", () => {
    const email = askEmail({ kind: "announce", events: [barts], url, replyBy: null, name: "Sam" });
    expect(email.subject).toBe("Can you make it? Sat 3 Oct — 1st XV v Barts");
    expect(email.text).toContain("Hi Sam,");
    expect(email.text).toContain(url);
    expect(email.text).not.toContain("Reply by");
  });

  it("names every Match that day in one email", () => {
    expect(askEmail({ kind: "announce", events: [barts, ucl], url, replyBy: null, name: "Sam" }).subject).toBe(
      "Can you make it? Sat 3 Oct — 1st XV v Barts & 2nd XV v UCL",
    );
  });

  it("gives the Reply By in London time", () => {
    const replyBy = new Date("2026-10-02T17:00:00Z");
    expect(askEmail({ kind: "announce", events: [barts], url, replyBy, name: "Sam" }).text).toContain("Please reply by Fri 2 Oct, 18:00.");
  });

  it("words a Nudge as a reminder", () => {
    const email = askEmail({ kind: "nudge", events: [barts], url, replyBy: null, name: "Sam" });
    expect(email.subject).toBe("Still need your answer: Sat 3 Oct — 1st XV v Barts");
    expect(email.text).toContain("haven't told us");
  });
});

describe("askEmail html", () => {
  it("has a button to the Event and the Reply By", () => {
    const replyBy = new Date("2026-10-02T17:00:00Z");
    const { html } = askEmail({ kind: "announce", events: [barts, ucl], url, replyBy, name: "Sam" });
    expect(html).toMatch(new RegExp(`<a href="${url}"[^>]*>Reply now</a>`));
    expect(html).toContain("1st XV v Barts &amp; 2nd XV v UCL");
    expect(html).toContain("Please reply by Fri 2 Oct, 18:00.");
  });
});

describe("askPush", () => {
  it("mirrors the Announce/Nudge email as a short push", () => {
    expect(askPush({ kind: "announce", events: [barts] })).toEqual({
      title: "Can you make it?",
      body: "Can you make it to Sat 3 Oct — 1st XV v Barts?",
    });
    expect(askPush({ kind: "nudge", events: [barts] })).toEqual({
      title: "Still need your answer",
      body: "You haven't told us yet whether you can make it to Sat 3 Oct — 1st XV v Barts.",
    });
  });
});

describe("chaseMessage", () => {
  it("writes September as Sep", () => {
    const training = { title: "Wednesday Training", start: new Date("2026-09-30T17:00:00Z") };
    expect(chaseMessage({ events: [training], names: ["Sam"], url })).toMatch(/^🏉 Wed 30 Sep — Wednesday Training\n/);
  });


  it("lists who hasn't replied, for the club WhatsApp", () => {
    expect(chaseMessage({ events: [barts], names: ["Sam Patel", "Jo King", "Tom Hale"], url })).toBe(
      ["🏉 Sat 3 Oct — 1st XV v Barts", "Still need a reply from: Sam Patel, Jo King, Tom Hale", `Can you make it? ${url}`].join("\n"),
    );
  });
});

describe("whatsappMessage", () => {
  it("greets by first name, names the Event and links to the app", () => {
    expect(whatsappMessage({ events: [barts], name: "Sam Patel", url })).toBe(
      `Hi Sam, can you make Sat 3 Oct (1st XV v Barts)? Let us know on the app: ${url}`,
    );
  });

  it("names every Match that day", () => {
    expect(whatsappMessage({ events: [barts, ucl], name: "Sam", url })).toContain("(1st XV v Barts & 2nd XV v UCL)");
  });
});
