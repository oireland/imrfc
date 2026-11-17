import { joinList } from "@/lib/join-names";

/** A shared Duty reads as everyone's: "with Sam", "with Sam & Priya"; null when the viewer's on it alone. */
export function othersOnDuty(userIds: string[], viewerId: string, name: (id: string) => string): string | null {
  const others = userIds.filter((id) => id !== viewerId).map(name);
  return others.length > 0 ? `with ${joinList(others)}` : null;
}
