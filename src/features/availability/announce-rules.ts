// The words for Announce and Nudge emails and the WhatsApp chase message. Pure, no
// database or Next.js.
import { emailLayout } from "@/lib/email-layout";
import { formatDay, formatWhen } from "@/lib/format-time";

export type AskedEvent = { title: string; start: Date };

/** "Sat 4 Oct — 1st XV v Barts & 2nd XV v UCL": one line for the Events one reply covers. */
function heading(events: AskedEvent[]): string {
  return `${formatDay(events[0].start)} — ${titlesOf(events)}`;
}

function titlesOf(events: AskedEvent[]): string {
  const titles = events.map((e) => e.title);
  return titles.length > 1 ? `${titles.slice(0, -1).join(", ")} & ${titles[titles.length - 1]}` : titles[0];
}

/** The email Announce (first ask) or Nudge (a reminder) sends each Player with No reply. */
export function askEmail({
  kind,
  events,
  url,
  replyBy,
  name,
}: {
  kind: "announce" | "nudge";
  events: AskedEvent[];
  url: string;
  replyBy: Date | null;
  name: string;
}): { subject: string; text: string; html: string } {
  const what = heading(events);
  const subject = kind === "announce" ? `Can you make it? ${what}` : `Still need your answer: ${what}`;
  const opener =
    kind === "announce"
      ? `Can you make it to ${what}?`
      : `You haven't told us yet whether you can make it to ${what}.`;
  const text = [
    `Hi ${name},`,
    "",
    opener,
    `Let us know here: ${url}`,
    ...(replyBy ? [`Please reply by ${formatWhen(replyBy, events[0].start)}.`] : []),
    "",
    "IMRFC",
  ].join("\n");
  const replyLine = replyBy ? `Please reply by ${formatWhen(replyBy, events[0].start)}.` : undefined;
  const html = emailLayout({
    preview: kind === "announce" ? `Can you make it? ${what}` : `Still need your answer for ${what}`,
    eyebrow: kind === "announce" ? "Can you make it?" : "Still need your answer",
    heading: titlesOf(events),
    paragraphs: [
      `Hi ${name},`,
      kind === "announce"
        ? `${formatWhen(events[0].start, events[0].start)}. Let us know whether you can make it. It only takes a tap.`
        : `${formatWhen(events[0].start, events[0].start)}. You haven't told us yet whether you can make it.`,
    ],
    button: { label: "Reply now", href: url },
    footnote: replyLine,
  });
  return { subject, text, html };
}

/** The push notification Announce or Nudge sends each Player with No reply, alongside the email. */
export function askPush({ kind, events }: { kind: "announce" | "nudge"; events: AskedEvent[] }): { title: string; body: string } {
  const what = heading(events);
  return {
    title: kind === "announce" ? "Can you make it?" : "Still need your answer",
    body: kind === "announce" ? `Can you make it to ${what}?` : `You haven't told us yet whether you can make it to ${what}.`,
  };
}

/** WhatsApp text listing who still hasn't replied. */
export function chaseMessage({ events, names, url }: { events: AskedEvent[]; names: string[]; url: string }): string {
  return [`🏉 ${heading(events)}`, `Still need a reply from: ${names.join(", ")}`, `Can you make it? ${url}`].join("\n");
}

/** The personal WhatsApp message Committee send one Player with No reply, prefilled in the chat. */
export function whatsappMessage({ events, name, url }: { events: AskedEvent[]; name: string; url: string }): string {
  return `Hi ${name.split(" ")[0]}, can you make ${formatDay(events[0].start)} (${titlesOf(events)})? Let us know on the app: ${url}`;
}
