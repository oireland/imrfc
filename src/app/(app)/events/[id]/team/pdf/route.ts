import { db } from "@/db/client";
import { getTeamCard } from "@/features/selection";
import { pdfResponse } from "@/components/team-sheet-pdf";
import { requireApprovedUser, viewerOf } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** The named team's sheet as a PDF, for anyone signed in (Committee's live sheet is at ../team-sheet/pdf). */
export async function GET(_request: Request, { params }: RouteContext<"/events/[id]/team/pdf">) {
  const { id } = await params;
  const current = await requireApprovedUser();
  const card = await getTeamCard(db, id, viewerOf(current));
  if (!card) return new Response(null, { status: 404 });

  return pdfResponse(card.layout, card.layout.date);
}
