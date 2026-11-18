/** Where to go after signing in: only a path on this site (e.g. an Event shared in the group chat), otherwise Home. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}

/** The Event id in a path like `/events/<id>`, for a shared link's preview. */
export function eventIdInPath(path: string): string | null {
  return path.match(/^\/events\/([^/?#]+)/)?.[1] ?? null;
}
