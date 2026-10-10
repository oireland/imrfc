import { describe, expect, it } from "vitest";
import { formatPhysioList } from "./physio-list-rules";

describe("formatPhysioList", () => {
  it("heads the message, then one line per Player with where it hurts and what they need", () => {
    expect(
      formatPhysioList("1st XV v Barts, Sat 4 Oct", [
        { name: "Tom Hale", area: "Shoulder", physioNote: "strapping" },
        { name: "Ali Reid", area: "Wrist/Hand", physioNote: "" },
      ]),
    ).toBe(["🩹 Physio list — 1st XV v Barts, Sat 4 Oct", "Ali Reid — wrist/hand", "Tom Hale — shoulder: strapping"].join("\n"));
  });

  it("says so when nobody needs the physio", () => {
    expect(formatPhysioList("Fri 10 Oct", [])).toBe("🩹 Physio list — Fri 10 Oct\nNobody needs the physio.");
  });
});
