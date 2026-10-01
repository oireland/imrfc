import { describe, expect, it } from "vitest";
import { buildSheet, missingFromSheet, rolesText, type SheetFields } from "./sheet";

const fields: SheetFields = {
  title: "IMRFC 1st XV vs Barts",
  kickoff: "2.30pm",
  meet: "12.00pm at the clubhouse",
  location: "Harlington",
  schedule: "Changing rooms 1.15pm, warm up 1.30pm",
  travelAttire: "Club polo",
  warmUpAttire: "",
  postMatchActivity: "Food in the bar",
  message: "Congratulations on your selection.",
};

describe("buildSheet", () => {
  it("prints the details, then one row per filled Shirt in order, skipping empty ones", () => {
    const sheet = buildSheet({
      date: "Sat 4 Oct",
      fields,
      shirts: [
        { shirt: 9, name: "Sam Patel", roles: [] },
        { shirt: 1, name: "Tom Hale", roles: ["KD", "C"] },
      ],
    });

    expect(sheet.title).toBe("IMRFC 1st XV vs Barts");
    expect(sheet.date).toBe("Sat 4 Oct");
    expect(sheet.rows).toEqual([
      { shirt: 1, name: "Tom Hale", roles: "C, KD" },
      { shirt: 9, name: "Sam Patel", roles: "" },
    ]);
    expect(sheet.message).toBe("Congratulations on your selection.");
  });

  it("leaves out details nobody filled in", () => {
    const sheet = buildSheet({ date: "Sat 4 Oct", fields, shirts: [] });
    expect(sheet.details.map((d) => d.label)).toEqual(["Kick-off", "Meet", "Location", "Schedule", "Travel attire", "Post match"]);
  });

  it("prints the legend of every Match Day Role", () => {
    const sheet = buildSheet({ date: "Sat 4 Oct", fields, shirts: [] });
    expect(sheet.legend).toContain("C = captain");
    expect(sheet.legend).toContain("KD = kit duty");
  });
});

describe("rolesText", () => {
  it("lists a person's roles in the fixed order", () => {
    expect(rolesText(["SGC", "VC", "LM"])).toBe("VC, LM, SGC");
  });
});

describe("missingFromSheet", () => {
  const player = (shirt: number, availability: "available" | "not_available" | "no_reply", name = `P${shirt}`) => ({
    shirt,
    name,
    guest: false,
    availability,
    roles: [] as ("C" | "VC")[],
  });

  it("flags empty starting Shirts, Players who can't make it or haven't replied, and no captain", () => {
    const filled = Array.from({ length: 13 }, (_, i) => player(i + 1, "available"));
    filled[2] = player(3, "not_available", "Sam");
    filled[4] = player(5, "no_reply", "Jo");
    const missing = missingFromSheet(filled);
    expect(missing).toEqual([
      "2 empty starting shirts (14, 15)",
      "Sam is not available",
      "Jo hasn't replied",
      "No captain",
    ]);
  });

  it("is happy with a full, available side with a captain, and ignores empty bench Shirts and Guests", () => {
    const all = Array.from({ length: 15 }, (_, i) => player(i + 1, "available"));
    all[0] = { ...all[0], roles: ["C"] };
    all.push({ shirt: 16, name: "Dev", guest: true, availability: "no_reply", roles: [] });
    expect(missingFromSheet(all)).toEqual([]);
  });
});
