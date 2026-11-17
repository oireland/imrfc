import { db } from "@/db/client";
import { getNotice } from "@/features/selection";
import { getCurrentUser, viewerOf } from "@/lib/session";

export const dynamic = "force-dynamic";

/** How a Name the team or Send changes' emails are going; the board polls this after pressing the button. */
export async function GET(_request: Request, { params }: RouteContext<"/api/notices/[id]">) {
  const user = await getCurrentUser();
  if (!user || user.accessState !== "approved") return new Response(null, { status: 401 });
  const notice = await getNotice(db, (await params).id, viewerOf(user));
  if (!notice) return new Response(null, { status: 404 });
  return Response.json(notice, { headers: { "Cache-Control": "private, no-store" } });
}
