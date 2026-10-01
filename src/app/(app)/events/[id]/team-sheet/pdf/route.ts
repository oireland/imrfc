import { db } from "@/db/client";
import { getTeamSheet } from "@/features/selection";
import { isCommitteeOrAbove } from "@/features/users";
import { renderTeamSheetPdf } from "@/components/team-sheet-pdf";
import { requireApprovedUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: RouteContext<"/events/[id]/team-sheet/pdf">) {
  const { id } = await params;
  const current = await requireApprovedUser();
  const sheet = await getTeamSheet(db, id, { id: current.id, committee: isCommitteeOrAbove(current.role) });
  if (!sheet) return new Response(null, { status: 404 });

  const filename = `${sheet.layout.title} ${sheet.date}`.replace(/[^\w ]+/g, "").trim().replace(/ +/g, "-");
  return new Response(new Uint8Array(await renderTeamSheetPdf(sheet.layout)), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
