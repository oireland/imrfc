import { describe, expect, it } from "vitest";
import { emailLayout } from "./email-layout";

const base = {
  preview: "Can you make it?",
  eyebrow: "Training",
  heading: "Wed 30 Sept",
  paragraphs: ["Hi Priya,"],
  button: { label: "Reply now", href: "https://app.imrfc.co.uk/events/e1" },
};

describe("emailLayout", () => {
  it("lays out the heading, text and a button linking to the page", () => {
    const html = emailLayout(base);
    expect(html).toContain("Wed 30 Sept");
    expect(html).toContain("Hi Priya,");
    expect(html).toMatch(/<a href="https:\/\/app\.imrfc\.co\.uk\/events\/e1"[^>]*>Reply now<\/a>/);
  });

  it("uses the Clubhouse theme: warm background, serif heading, the crest", () => {
    const html = emailLayout(base);
    expect(html).toContain("#f5f4f0");
    expect(html).toContain("Instrument Serif");
    expect(html).toContain('src="cid:crest"');
  });

  it("escapes anything that came from people", () => {
    const html = emailLayout({ ...base, heading: "Barts <script>", paragraphs: ["Tom & Jo"] });
    expect(html).toContain("Barts &lt;script&gt;");
    expect(html).toContain("Tom &amp; Jo");
    expect(html).not.toContain("<script>");
  });
});
