import { STATUS_LABEL, type InjuryStatus, type InjuryView } from "@/features/injuries";
import { formatDay } from "@/features/players";
import { formatDay as formatInstant } from "@/lib/format-time";

export type InjuryItem = {
  id: string;
  area: string;
  description: string;
  status: Exclude<InjuryStatus, "cleared">;
  statusLabel: string;
  /** "Since 21 Sep · back about 12 Oct". */
  summary: string;
  /** "Since 21 Sep". */
  since: string;
  expectedReturn: string | null;
  /** The passed Expected Return ("12 Oct") when Home should ask "Still expecting…?", else null. */
  stillExpecting: string | null;
  needsPhysio: boolean;
  physioNote: string;
  /** For Committee: "Due back 12 Oct, check in". */
  checkIn: string | null;
  history: { text: string; note: string; by: string; when: string }[];
};

const label = (status: InjuryStatus | null) => (status ? STATUS_LABEL[status] : "");

function historyText(change: InjuryView["history"][number]): string {
  if (change.kind === "reported") return `Reported · ${label(change.to)}`;
  if (change.kind === "cleared") return "Cleared";
  if (change.kind === "mistake") return "Logged by mistake";
  return change.from === change.to ? `Still ${label(change.to)}` : `${label(change.from)} → ${label(change.to)}`;
}

/** Injuries as the cards show them: dates and statuses already written out. */
export function injuryItems(views: InjuryView[]): InjuryItem[] {
  return views.map((v) => ({
    id: v.id,
    area: v.area,
    description: v.description,
    status: v.status as InjuryItem["status"],
    statusLabel: STATUS_LABEL[v.status],
    since: `Since ${formatDay(v.happenedOn)}`,
    summary: [`Since ${formatDay(v.happenedOn)}`, v.expectedReturn ? `back about ${formatDay(v.expectedReturn)}` : null].filter(Boolean).join(" · "),
    expectedReturn: v.expectedReturn,
    stillExpecting: v.stillExpecting && v.expectedReturn ? formatDay(v.expectedReturn) : null,
    needsPhysio: v.needsPhysio,
    physioNote: v.physioNote,
    checkIn: v.checkIn,
    history: v.history.map((c) => ({ text: historyText(c), note: c.note, by: c.by, when: formatInstant(c.at) })),
  }));
}
