export type MorningOfEvent = { id: string; title: string; start: Date };

export type MorningOfReasons = {
  /** Titles of today's Events this User has a Duty on. */
  duty: string[];
  /** Titles of today's Events this User replied Available to. */
  available: string[];
};

/**
 * One entry per User with something on today, combining every reason across every Event
 * so each User gets a single push rather than one per Event.
 */
export function morningOfRecipients(input: {
  events: MorningOfEvent[];
  dutyUserIds: Map<string, Set<string>>;
  availableUserIds: Map<string, Set<string>>;
}): Map<string, MorningOfReasons> {
  const recipients = new Map<string, MorningOfReasons>();
  const reasonsFor = (userId: string) => {
    const existing = recipients.get(userId);
    if (existing) return existing;
    const created: MorningOfReasons = { duty: [], available: [] };
    recipients.set(userId, created);
    return created;
  };

  for (const event of input.events) {
    for (const userId of input.dutyUserIds.get(event.id) ?? []) reasonsFor(userId).duty.push(event.title);
    for (const userId of input.availableUserIds.get(event.id) ?? []) reasonsFor(userId).available.push(event.title);
  }
  return recipients;
}

/** The notification title/body for one User's reasons, teammate-toned rather than a jargon list. */
export function morningOfMessage(reasons: MorningOfReasons): { title: string; body: string } {
  if (reasons.duty.length + reasons.available.length === 1) {
    if (reasons.duty.length === 1) return { title: `Today: ${reasons.duty[0]}`, body: "You're on duty for it." };
    return { title: `Today: ${reasons.available[0]}`, body: "You said you're in — see you there." };
  }
  const parts: string[] = [];
  if (reasons.duty.length > 0) parts.push(`You're on duty for ${reasons.duty.join(", ")}.`);
  if (reasons.available.length > 0) parts.push(`You're in for ${reasons.available.join(", ")}.`);
  return { title: "Today", body: parts.join(" ") };
}
