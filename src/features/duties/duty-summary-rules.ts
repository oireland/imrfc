// Duty Summary: plain text for the club WhatsApp group. Pure, no database or Next.js.

export type DutySummaryItem = {
  kitName: string;
  /** The count this Checklist line asks for, and the Kit Unit's Quantity (shown as "×N" only when > 1). */
  count: number;
  quantity: number;
  to: string | null;
  from: string | null;
};

const UNASSIGNED = "❗unassigned";

const part = (d: Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", ...options }).format(d);

export function formatDutySummary({
  title,
  start,
  venueName,
  items,
}: {
  title: string;
  start: Date;
  venueName: string;
  items: DutySummaryItem[];
}): string {
  const date = part(start, { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
  const time = part(start, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const lines = items.map(({ kitName, count, quantity, to, from }) => {
    const label = quantity > 1 ? `${kitName} ×${count}` : kitName;
    return !to && !from
      ? `${label}: ${UNASSIGNED}`
      : `${label}: ${to ? `${to} →` : `${UNASSIGNED} →`} / ${from ? `← ${from}` : `← ${UNASSIGNED}`}`;
  });
  return [`🏉 ${date} — ${title}, ${time}, ${venueName}`, ...lines].join("\n");
}
