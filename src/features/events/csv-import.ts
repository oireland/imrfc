import { buildQuickEvent } from "./quick-add";
import type { Competition, EventType, HomeAway, NewEvent } from "./rules";

/**
 * The columns of an Events CSV. The first row of the file must be a header row
 * naming the columns (any order, any case); the `required` ones must be there.
 */
export const EVENT_CSV_COLUMNS = [
  { name: "type", required: true, description: "training, match or social.", example: "training" },
  { name: "title", required: false, description: "Socials only, and required for them. Training and matches are titled from their details (“Training @ Harlington”, “1st XV vs UCL Medics”), so anything here is ignored.", example: "Curry night" },
  { name: "date", required: true, description: "YYYY-MM-DD or DD/MM/YYYY.", example: "2026-10-21" },
  { name: "start_time", required: true, description: "24-hour HH:MM, London time. Kick-off for a match: TBC or blank if it isn't known yet.", example: "19:00" },
  { name: "end_time", required: false, description: "24-hour HH:MM, required for training and socials. Earlier than the start means it ends the next day. Matches run two hours, so it's ignored for them.", example: "21:00" },
  { name: "venue", required: true, description: "Where it is: a ground, a pub, an address. Anything that helps people find it.", example: "Harlington" },
  { name: "notes", required: false, description: "Anything else people should know.", example: "Bring boots" },
  { name: "team", required: false, description: "Matches only, and required for them: the team name.", example: "1st XV" },
  { name: "opponent", required: false, description: "Matches only, and required for them.", example: "UCL Medics" },
  { name: "home_away", required: false, description: "Matches only: home or away. Blank means home.", example: "away" },
  { name: "competition", required: false, description: "Matches only: bucs, lusl, friendly or other. Blank means friendly.", example: "bucs" },
  { name: "meet_time", required: false, description: "Matches only: HH:MM to arrive at the venue. TBC or blank means not known yet.", example: "13:30" },
  { name: "travel_meet_time", required: false, description: "Matches only: HH:MM to meet and travel together. TBC or blank means not known yet.", example: "12:15" },
  { name: "travel_meet_point", required: false, description: "Matches only: where to meet to travel together.", example: "South Ken station" },
] as const;

export const MAX_EVENTS_PER_IMPORT = 500;

type ColumnName = (typeof EVENT_CSV_COLUMNS)[number]["name"];
type Lookup = { id: string; name: string };
export type EventCsvResult = { ok: true; events: NewEvent[] } | { ok: false; errors: string[] };

const MATCH_ONLY: ColumnName[] = ["team", "opponent", "home_away", "competition", "meet_time", "travel_meet_time", "travel_meet_point"];
const TYPES: EventType[] = ["training", "match", "social"];
const HOME_AWAY: HomeAway[] = ["home", "away"];
const COMPETITIONS: Competition[] = ["bucs", "lusl", "friendly", "other"];

/** RFC 4180 CSV: quoted fields may hold commas, newlines and doubled quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Reads an Events CSV into NewEvents. All or nothing: any problem means no events. */
export function readEventsCsv(text: string, lookups: { teams: Lookup[] }): EventCsvResult {
  const rows = parseCsv(text)
    .map((cells, i) => ({ number: i + 1, cells }))
    .filter((r) => r.cells.some((c) => c.trim() !== ""));
  if (rows.length === 0) return { ok: false, errors: ["The file is empty."] };

  const [header, ...data] = rows;
  const headerError = checkHeader(header.cells);
  if (headerError) return { ok: false, errors: [headerError] };
  if (data.length === 0) return { ok: false, errors: ["There are no events in the file, only the header row."] };
  if (data.length > MAX_EVENTS_PER_IMPORT) {
    return { ok: false, errors: [`That's ${data.length} events — import at most ${MAX_EVENTS_PER_IMPORT} at a time.`] };
  }

  const columns = header.cells.map(normalise) as ColumnName[];
  const errors: string[] = [];
  const events: NewEvent[] = [];
  for (const { number, cells } of data) {
    if (cells.length !== columns.length) {
      errors.push(`Row ${number}: has ${cells.length} values but the header has ${columns.length} columns.`);
      continue;
    }
    const values = Object.fromEntries(columns.map((c, i) => [c, cells[i].trim()])) as Partial<Record<ColumnName, string>>;
    const result = readRow(values, lookups);
    if (result.ok) events.push(result.event);
    else errors.push(...result.errors.map((e) => `Row ${number}: ${e}`));
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, events };
}

/** A ready-to-fill CSV: the header row plus a Training, two Matches and a Social. */
export function eventCsvTemplate(): string {
  const rows = [
    EVENT_CSV_COLUMNS.map((c) => c.name),
    ["training", "", "2026-10-21", "19:00", "21:00", "Harlington", "Bring boots, gum shields", "", "", "", "", "", "", ""],
    ["match", "", "2026-10-24", "14:30", "", "Teddington", "", "1st XV", "UCL Medics", "away", "bucs", "13:30", "12:15", "South Ken station"],
    ["match", "", "2026-10-31", "TBC", "", "Harlington", "", "2nd XV", "KCL", "home", "friendly", "TBC", "TBC", ""],
    ["social", "Curry night", "2026-10-30", "20:00", "23:30", "Harlington", "", "", "", "", "", "", "", ""],
  ];
  return rows.map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function normalise(cell: string): string {
  return cell.trim().toLowerCase();
}

function checkHeader(cells: string[]): string | undefined {
  const names = cells.map(normalise);
  const known: string[] = EVENT_CSV_COLUMNS.map((c) => c.name);
  const missing = EVENT_CSV_COLUMNS.filter((c) => c.required && !names.includes(c.name)).map((c) => c.name);
  if (missing.length > 0) {
    return `The first row must be the header row. It's missing ${missing.length === 1 ? "this column" : "these columns"}: ${missing.join(", ")}.`;
  }
  const unknown = names.filter((n) => !known.includes(n));
  if (unknown.length > 0) {
    const list = unknown.map((n) => `"${n}"`).join(", ");
    return `The header has ${unknown.length === 1 ? "a column" : "columns"} we don't recognise: ${list}.`;
  }
  const repeated = names.find((n, i) => names.indexOf(n) !== i);
  if (repeated) return `The header has "${repeated}" more than once.`;
}

const isTbc = (raw: string) => raw.toLowerCase() === "tbc";

function readRow(
  v: Partial<Record<ColumnName, string>>,
  { teams }: { teams: Lookup[] },
): { ok: true; event: NewEvent } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const get = (c: ColumnName) => v[c] ?? "";

  const type = get("type").toLowerCase() as EventType;
  if (!type) errors.push("type is missing.");
  else if (!TYPES.includes(type)) errors.push(`type must be training, match or social (not "${get("type")}").`);
  const isMatch = type === "match";

  const date = readDate(get("date"));
  if (!get("date")) errors.push("date is missing.");
  else if (!date) errors.push(`date must be YYYY-MM-DD or DD/MM/YYYY (not "${get("date")}").`);

  /** A time of day; blank (or TBC, for a Match) is allowed where `required` is false. */
  const time = (c: ColumnName, required: boolean) => {
    const raw = get(c);
    if (!raw || (isMatch && isTbc(raw))) {
      if (required && !raw) errors.push(`${c} is missing.`);
      return undefined;
    }
    const t = readTime(raw);
    if (!t) errors.push(`${c} must be 24-hour HH:MM (not "${raw}").`);
    return t;
  };
  const startTime = time("start_time", !isMatch);
  const endTime = isMatch ? undefined : time("end_time", true);

  const venue = get("venue");
  if (!venue) errors.push("venue is missing.");

  const title = get("title");
  if (type === "social" && !title) errors.push("a social needs a title.");

  let teamId: string | undefined;
  let homeAway: HomeAway | undefined;
  let competition: Competition | undefined;
  let meetTime: string | undefined;
  let travelMeetTime: string | undefined;
  if (isMatch) {
    if (!get("team")) errors.push("a match needs a team.");
    else {
      const t = findByName(teams, get("team"));
      if (t) teamId = t.id;
      else errors.push(`there's no team called "${get("team")}". Teams: ${names(teams)}.`);
    }
    if (!get("opponent")) errors.push("a match needs an opponent.");
    const ha = get("home_away").toLowerCase();
    if (ha && !HOME_AWAY.includes(ha as HomeAway)) errors.push(`home_away must be home or away (not "${get("home_away")}").`);
    else homeAway = (ha || undefined) as HomeAway | undefined;
    const comp = get("competition").toLowerCase();
    if (comp && !COMPETITIONS.includes(comp as Competition)) {
      errors.push(`competition must be bucs, lusl, friendly or other (not "${get("competition")}").`);
    } else competition = (comp || undefined) as Competition | undefined;
    meetTime = time("meet_time", false);
    travelMeetTime = time("travel_meet_time", false);
  } else if (TYPES.includes(type)) {
    for (const c of MATCH_ONLY) if (get(c)) errors.push(`${c} is only for matches.`);
  }

  if (errors.length > 0 || !date || !venue) return { ok: false, errors };

  const built = buildQuickEvent({
    date,
    startTime: startTime ?? "00:00",
    endTime,
    type,
    title,
    venue,
    kickoffTbc: isMatch && !startTime,
    teamId,
    opponent: get("opponent"),
    homeAway,
    competition,
    meetTime,
    travelMeetTime,
    travelMeetPoint: get("travel_meet_point"),
    notes: get("notes"),
  });
  return { ok: true, event: built };
}

/** YYYY-MM-DD or DD/MM/YYYY → YYYY-MM-DD, if it's a real calendar date. */
function readDate(raw: string): string | undefined {
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const uk = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : uk ? [uk[3], uk[2], uk[1]] : [];
  if (!y) return undefined;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) return undefined;
  return date.toISOString().slice(0, 10);
}

/** H:MM or HH:MM on a 24-hour clock → HH:MM. */
function readTime(raw: string): string | undefined {
  const t = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!t || Number(t[1]) > 23 || Number(t[2]) > 59) return undefined;
  return `${t[1].padStart(2, "0")}:${t[2]}`;
}

function findByName(list: Lookup[], name: string): Lookup | undefined {
  const wanted = normalise(name);
  return wanted ? list.find((x) => normalise(x.name) === wanted) : undefined;
}

function names(list: Lookup[]): string {
  return list.map((x) => x.name).join(", ") || "none yet";
}
