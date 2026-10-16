type Env = Record<string, string | undefined>;

/**
 * The app's public address, for links in emails. Comes from configuration (never the request's
 * Host header, which a preview domain or a crafted request could change): APP_URL, else the
 * BETTER_AUTH_URL sign-in already needs, else Vercel's production domain, else local dev.
 */
export function appUrl(env: Env = process.env): string {
  const configured = env.APP_URL || env.BETTER_AUTH_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

/** A link to an Event's page, for emails. */
export function eventLink(eventId: string, env: Env = process.env): string {
  return `${appUrl(env)}/events/${eventId}`;
}
