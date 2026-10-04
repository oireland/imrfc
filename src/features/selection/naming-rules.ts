// The rules for Name the team: what changed since the team was last sent, and the words
// each person hears. Pure, no database or Next.js.
import { positionOfShirt } from "./shirts";

/** One filled Shirt, as last sent or as it is on the board now. */
export type Slot = { shirt: number; userId: string | null; guestName: string | null; roles: string[] };

export type ChangeKind = "in" | "moved" | "dropped";
/** What a Player is told: added, moved to `shirt`, or dropped (no Shirt). */
export type Change = { userId: string; kind: ChangeKind; shirt: number | null };

const sameRoles = (a: string[], b: string[]) => a.length === b.length && a.every((r) => b.includes(r));

/**
 * How the board differs from what was sent. `changes` are the Players to tell; `unsent` is
 * what the board says is "not sent yet": one per Player to tell, plus Guest and Match Day
 * Role edits, which tell nobody but still change the Team card.
 */
export function diffNamed(sent: Slot[], current: Slot[]): { changes: Change[]; unsent: number } {
  const was = new Map(sent.flatMap((s) => (s.userId ? [[s.userId, s.shirt] as const] : [])));
  const now = new Map(current.flatMap((s) => (s.userId ? [[s.userId, s.shirt] as const] : [])));

  const changes: Change[] = [];
  for (const [userId, shirt] of now) {
    if (!was.has(userId)) changes.push({ userId, kind: "in", shirt });
    else if (was.get(userId) !== shirt) changes.push({ userId, kind: "moved", shirt });
  }
  for (const userId of was.keys()) if (!now.has(userId)) changes.push({ userId, kind: "dropped", shirt: null });

  let quiet = 0;
  const shirts = new Set([...sent, ...current].map((s) => s.shirt));
  for (const shirt of shirts) {
    const before = sent.find((s) => s.shirt === shirt);
    const after = current.find((s) => s.shirt === shirt);
    if (before?.guestName || after?.guestName) {
      if (before?.guestName !== after?.guestName) quiet++;
    } else if (before?.userId && before.userId === after?.userId && !sameRoles(before.roles, after.roles)) quiet++;
  }
  return { changes, unsent: changes.length + quiet };
}

const where = (shirt: number) => {
  const position = positionOfShirt(shirt);
  return position ? `at ${shirt} (${position})` : `on the bench (${shirt})`;
};

/** The push title and body (also the email's) for one Player's change. */
export function noticeMessage(
  change: { kind: ChangeKind; shirt: number | null },
  team: { label: string; date: string },
): { title: string; body: string } {
  const { label, date } = team;
  if (change.kind === "dropped") {
    return { title: `You're out of the ${label}`, body: `You're no longer in the ${label} team for ${date}.` };
  }
  const place = where(change.shirt!);
  if (change.kind === "moved") {
    return { title: `You've moved in the ${label}`, body: `You've moved in the ${label} for ${date}: you're now ${place}.` };
  }
  return { title: `You're in the ${label}`, body: `You're in the ${label} for ${date}, ${place}.` };
}

/** The push Committee get when a picked Player replies Not available after the team is named. */
export function committeeAlert(input: { name: string; shirt: number; label: string; date: string }): { title: string; body: string } {
  const first = input.name.split(" ")[0];
  return { title: `${first} can't make it`, body: `${first} can't make ${input.date}: at ${input.shirt} for the ${input.label}.` };
}
