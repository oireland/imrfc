import { describe, expect, it } from "vitest";
import { EVENT_CSV_COLUMNS, eventCsvTemplate, parseCsv, readEventsCsv } from "./csv-import";

const lookups = {
  teams: [
    { id: "1st XV", name: "1st XV" },
    { id: "2nd XV", name: "2nd XV" },
  ],
};

const HEADER = "title,type,date,start_time,end_time,venue";

function read(...lines: string[]) {
  return readEventsCsv(lines.join("\n"), lookups);
}

describe("parseCsv", () => {
  it("splits rows and fields, honouring quotes, escaped quotes and CRLF", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\r\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });

  it("keeps newlines inside quoted fields and drops a byte-order mark", () => {
    expect(parseCsv('﻿notes\n"line one\nline two"')).toEqual([["notes"], ["line one\nline two"]]);
  });
});

describe("readEventsCsv", () => {
  it("turns a Training row into an Event in London time", () => {
    const result = read(HEADER, "Wednesday Training,training,2026-10-21,19:00,21:00,Harlington");

    expect(result).toEqual({
      ok: true,
      events: [
        {
          title: "Wednesday Training",
          eventType: "training",
          start: new Date("2026-10-21T18:00:00Z"),
          end: new Date("2026-10-21T20:00:00Z"),
          venue: "Harlington",
          notes: "",
          teamIds: [],
        },
      ],
    });
  });

  it("accepts UK dates (DD/MM/YYYY), as spreadsheets often save them, and GMT after the clocks go back", () => {
    const result = read(HEADER, "Training,training,28/10/2026,19:00,21:00,Harlington");

    expect(result.ok && result.events[0].start).toEqual(new Date("2026-10-28T19:00:00Z"));
  });

  it("allows columns in any order and any case, and skips blank lines", () => {
    const result = read("Venue,TYPE,Date,Title,End_Time,Start_Time", "", '"The Anchor, SW7",Social,2026-11-06,Curry,23:00,20:00', ",,,,,");

    expect(result.ok && result.events).toMatchObject([{ title: "Curry", eventType: "social", venue: "The Anchor, SW7" }]);
  });

  it("names an untitled row after its type, and ends the next day when the end time is earlier", () => {
    const result = read(HEADER, ",social,2026-11-06,20:00,01:00,Harlington");

    expect(result.ok && result.events[0]).toMatchObject({ title: "Social", end: new Date("2026-11-07T01:00:00Z") });
  });

  it("reads Teams (separated by semicolons) and notes", () => {
    const result = read(`${HEADER},teams,notes`, 'Training,training,2026-10-21,19:00,21:00,Harlington,"1st XV; 2nd xv",Bring boots');

    expect(result.ok && result.events[0]).toMatchObject({ teamIds: ["1st XV", "2nd XV"], notes: "Bring boots" });
  });

  it("reads Match details, defaulting to a home friendly meeting at kick-off", () => {
    const result = read(
      `${HEADER},opponent,home_away,competition,meet_time,travel_meet_time,travel_meet_point`,
      ",match,2026-10-24,14:30,16:30,Teddington,UCL Medics,away,BUCS,13:30,12:15,South Ken station",
      "KCL,match,2026-10-31,14:30,16:30,Harlington,KCL,,,,,",
    );

    expect(result.ok && result.events).toEqual([
      expect.objectContaining({
        title: "vs UCL Medics",
        matchDetails: {
          opponent: "UCL Medics",
          homeAway: "away",
          competition: "bucs",
          meetTime: new Date("2026-10-24T12:30:00Z"),
          travelMeetTime: new Date("2026-10-24T11:15:00Z"),
          travelMeetPoint: "South Ken station",
        },
      }),
      expect.objectContaining({
        title: "KCL",
        matchDetails: {
          opponent: "KCL",
          homeAway: "home",
          competition: "friendly",
          meetTime: new Date("2026-10-31T14:30:00Z"),
        },
      }),
    ]);
  });

  it("requires a header row naming every required column", () => {
    const result = read("Training,training,2026-10-21,19:00,21:00,Harlington");

    expect(result).toEqual({
      ok: false,
      errors: [
        "The first row must be the header row. It's missing these columns: title, type, date, start_time, end_time, venue.",
      ],
    });
  });

  it("rejects columns it doesn't know, and the same column twice", () => {
    expect(read(`${HEADER},equipment`)).toEqual({ ok: false, errors: ['The header has a column we don\'t recognise: "equipment".'] });
    expect(read(`${HEADER},Title`)).toEqual({ ok: false, errors: ['The header has "title" more than once.'] });
  });

  it("says when there are no events under the header", () => {
    expect(read(HEADER)).toEqual({ ok: false, errors: ["There are no events in the file, only the header row."] });
    expect(read("")).toEqual({ ok: false, errors: ["The file is empty."] });
  });

  it("lists every problem with its spreadsheet row number, and imports nothing", () => {
    const result = read(
      HEADER,
      "Training,training,2026-10-21,19:00,21:00,Harlington",
      "Training,rugby,2026-13-01,7pm,21:00,",
      "Match,match,2026-10-24,14:30,16:30,Harlington",
      "Too few,training",
    );

    expect(result).toEqual({
      ok: false,
      errors: [
        'Row 3: type must be training, match or social (not "rugby").',
        'Row 3: date must be YYYY-MM-DD or DD/MM/YYYY (not "2026-13-01").',
        'Row 3: start_time must be 24-hour HH:MM (not "7pm").',
        "Row 3: venue is missing.",
        "Row 4: a match needs an opponent.",
        "Row 5: has 2 values but the header has 6 columns.",
      ],
    });
  });

  it("rejects unknown Teams, bad match choices, and match details on other types", () => {
    const result = read(
      `${HEADER},teams,opponent,home_away,competition`,
      "Training,training,2026-10-21,19:00,21:00,Harlington,3rd XV,UCL,,",
      "Match,match,2026-10-24,14:30,16:30,Harlington,,UCL,neutral,cup",
    );

    expect(result).toEqual({
      ok: false,
      errors: [
        'Row 2: there\'s no team called "3rd XV". Teams: 1st XV, 2nd XV.',
        "Row 2: opponent is only for matches.",
        'Row 3: home_away must be home or away (not "neutral").',
        'Row 3: competition must be bucs, lusl, friendly or other (not "cup").',
      ],
    });
  });

  it("caps an import at 500 events", () => {
    const rows = Array.from({ length: 501 }, () => "Training,training,2026-10-21,19:00,21:00,Harlington");

    expect(read(HEADER, ...rows)).toEqual({ ok: false, errors: ["That's 501 events — import at most 500 at a time."] });
  });
});

describe("eventCsvTemplate", () => {
  it("has a header with every column, and example rows that read back cleanly", () => {
    const template = eventCsvTemplate();

    expect(parseCsv(template)[0]).toEqual(EVENT_CSV_COLUMNS.map((c) => c.name));
    expect(readEventsCsv(template, lookups).ok).toBe(true);
  });
});
