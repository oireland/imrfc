import { STARTING_SHIRTS } from "./shirts";

/** Match Day Roles in the order a sheet prints them. C and VC go to one person each. */
export const ROLES = ["C", "VC", "LM", "HT", "NT", "SGC", "KD"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_NAMES: Record<Role, string> = {
  C: "captain",
  VC: "vice captain",
  LM: "linesman",
  HT: "hydration technician",
  NT: "nutrition technician",
  SGC: "shower gel captain",
  KD: "kit duty",
};

export const SINGLE_ROLES: Role[] = ["C", "VC"];

export const rolesText = (roles: Role[]) => ROLES.filter((r) => roles.includes(r)).join(", ");

/** What the Team Sheet says, read from the Event and its match details. */
export type SheetFields = {
  title: string;
  kickoff: string;
  meet: string;
  location: string;
  schedule: string;
  travelAttire: string;
  warmUpAttire: string;
  postMatchActivity: string;
};

type SheetRow = { shirt: number; name: string; roles: string };

export type SheetLayout = {
  title: string;
  date: string;
  details: { label: string; value: string }[];
  rows: SheetRow[];
  /** The rows split into Starting (1–15) and Finishers (16 and up); a section nobody is in is left out. */
  sections: { title: string; rows: SheetRow[] }[];
  legend: string;
};

const DETAILS: [label: string, field: keyof SheetFields][] = [
  ["Kick-off", "kickoff"],
  ["Meet", "meet"],
  ["Location", "location"],
  ["Schedule", "schedule"],
  ["Travel attire", "travelAttire"],
  ["Warm up attire", "warmUpAttire"],
  ["Post match", "postMatchActivity"],
];

/** The one layout the on-screen preview and the PDF both draw (ADR 0005). */
export function buildSheet(input: {
  date: string;
  fields: SheetFields;
  shirts: { shirt: number; name: string; roles: Role[] }[];
}): SheetLayout {
  const { fields } = input;
  const rows = [...input.shirts]
    .sort((a, b) => a.shirt - b.shirt)
    .map((s) => ({ shirt: s.shirt, name: s.name, roles: rolesText(s.roles) }));
  return {
    title: fields.title,
    date: input.date,
    details: DETAILS.map(([label, field]) => ({ label, value: fields[field].trim() })).filter((d) => d.value),
    rows,
    sections: [
      { title: "Starting", rows: rows.filter((r) => r.shirt <= STARTING_SHIRTS) },
      { title: "Finishers", rows: rows.filter((r) => r.shirt > STARTING_SHIRTS) },
    ].filter((s) => s.rows.length > 0),
    legend: ROLES.map((r) => `${r} = ${ROLE_NAMES[r]}`).join(" · "),
  };
}

export type SheetPerson = {
  shirt: number;
  name: string;
  guest: boolean;
  availability: "available" | "not_available" | "no_reply";
  roles: Role[];
};

/** Things worth fixing before naming the team. It only warns; nothing here blocks. */
export function missingFromSheet(people: SheetPerson[]): string[] {
  const missing: string[] = [];
  const filled = new Set(people.map((p) => p.shirt));
  const empty = Array.from({ length: STARTING_SHIRTS }, (_, i) => i + 1).filter((s) => !filled.has(s));
  if (empty.length) missing.push(`${empty.length} empty starting ${empty.length === 1 ? "shirt" : "shirts"} (${empty.join(", ")})`);
  for (const p of people) {
    if (p.guest) continue;
    if (p.availability === "not_available") missing.push(`${p.name} is not available`);
    else if (p.availability === "no_reply") missing.push(`${p.name} hasn't replied`);
  }
  if (!people.some((p) => p.roles.includes("C"))) missing.push("No captain");
  return missing;
}
