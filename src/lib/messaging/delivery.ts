/**
 * How a batch of emails is going: shared by Announce/Nudge (availability) and Name the
 * team/Send changes (selection). Each feature owns its table and its wording; this owns
 * the rules for "who was reached", "is it failed" and "retry".
 */

export type DeliveryStatus = "sending" | "sent" | "failed";

/** The columns both features record about a send. */
export type DeliveryRow = { createdAt: Date; finishedAt: Date | null; reachedIds: string[]; missedIds: string[] };

export type DeliveryProgress = { status: DeliveryStatus; total: number; sent: number; missed: string[] };

/** A send that hasn't finished after this long was cut off (e.g. the server timed out). */
const CUT_OFF_MS = 15 * 60_000;

/** Still sending, sent to everyone, or failed: someone wasn't reached, or the send was cut off. */
export function deliveryStatus(row: Pick<DeliveryRow, "createdAt" | "finishedAt" | "missedIds">, now: Date): DeliveryStatus {
  if (!row.finishedAt) return now.getTime() - row.createdAt.getTime() >= CUT_OFF_MS ? "failed" : "sending";
  return row.missedIds.length > 0 ? "failed" : "sent";
}

/** What the UI needs: status, how many to reach, how many reached, and who was missed (by name). */
export function deliveryProgress(row: DeliveryRow, recipientIds: string[], name: (id: string) => string, now: Date): DeliveryProgress {
  const status = deliveryStatus(row, now);
  // A send that was cut off never recorded who it missed: count everyone not reached.
  const missed = status === "failed" && !row.finishedAt ? recipientIds.filter((id) => !row.reachedIds.includes(id)) : row.missedIds;
  return { status, total: recipientIds.length, sent: row.reachedIds.length, missed: missed.map(name) };
}

/** Whether a send failed and so can be retried. */
export const canRetry = (row: DeliveryRow, now: Date): boolean => deliveryStatus(row, now) === "failed";

/** Who a retry still has to reach. */
export const stillToReach = (recipientIds: string[], reachedIds: string[]): string[] => recipientIds.filter((id) => !reachedIds.includes(id));

/** The columns to set to put a failed send back to sending. */
export const restart = (now: Date) => ({ finishedAt: null, missedIds: [] as string[], createdAt: now });

/** The columns to set once a go at sending has finished; `before` is who earlier goes reached. */
export function finish(recipientIds: string[], before: string[], reachedNow: string[], now: Date) {
  const reachedIds = [...before, ...reachedNow];
  return { reachedIds, missedIds: recipientIds.filter((id) => !reachedIds.includes(id)), finishedAt: now };
}

/**
 * Tries each recipient in turn; one failing doesn't stop the rest. `send` resolves to what
 * to remember about them, or `undefined` to skip them (they then count as missed).
 */
export async function deliverEach<R, O>(
  recipients: R[],
  send: (recipient: R) => Promise<O | undefined>,
  onError: (recipient: R, error: unknown) => void,
): Promise<{ recipient: R; outcome: O }[]> {
  const reached: { recipient: R; outcome: O }[] = [];
  for (const recipient of recipients) {
    try {
      const outcome = await send(recipient);
      if (outcome !== undefined) reached.push({ recipient, outcome });
    } catch (error) {
      onError(recipient, error);
    }
  }
  return reached;
}
