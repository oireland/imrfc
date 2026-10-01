import { db } from "@/db/client";
import { getAsk } from "@/features/availability";
import { isCommitteeOrAbove } from "@/features/users";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** How an Announce or Nudge's emails are going; the Availability card polls this after Send. */
export async function GET(_request: Request, { params }: RouteContext<"/api/asks/[id]">) {
  const user = await getCurrentUser();
  if (!user || user.accessState !== "approved") return new Response(null, { status: 401 });
  const ask = await getAsk(db, (await params).id, { id: user.id, committee: isCommitteeOrAbove(user.role) });
  if (!ask) return new Response(null, { status: 404 });
  return Response.json(ask, { headers: { "Cache-Control": "private, no-store" } });
}
