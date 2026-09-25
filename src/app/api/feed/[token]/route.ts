import { db } from "@/db/client";
import { renderFeed } from "@/features/calendar-feed";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: RouteContext<"/api/feed/[token]">) {
  const { token } = await params;
  const result = await renderFeed(db, token.replace(/\.ics$/, ""));
  if (result.status !== 200) return new Response(null, { status: result.status });
  return new Response(result.body, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}
