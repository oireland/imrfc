import { db } from "@/db/client";
import { getTeamCard } from "@/features/selection";
import { isCommitteeOrAbove } from "@/features/users";
import { renderTeamSheetPdf } from "@/components/team-sheet-pdf";
import { requireApprovedUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The named team's sheet as a PDF, for anyone signed in (Committee's live sheet is at ../team-sheet/pdf). */
export async function GET(_request: Request, { params }: RouteContext<"/events/[id]/team/pdf">) {
  const { id } = await params;
  const current = await requireApprovedUser();
  const card = await getTeamCard(db, id, { id: current.id, committee: isCommitteeOrAbove(current.role) });
  if (!card) return new Response(null, { status: 404 });

  const filename = `${card.layout.title} ${card.layout.date}`.replace(/[^\w ]+/g, "").trim().replace(/ +/g, "-");
  return new Response(new Uint8Array(await renderTeamSheetPdf(card.layout)), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
