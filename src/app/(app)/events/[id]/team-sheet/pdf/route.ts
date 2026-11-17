import { db } from "@/db/client";
import { getTeamSheet } from "@/features/selection";
import { pdfResponse } from "@/components/team-sheet-pdf";
import { requireApprovedUser, viewerOf } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: RouteContext<"/events/[id]/team-sheet/pdf">) {
  const { id } = await params;
  const current = await requireApprovedUser();
  const sheet = await getTeamSheet(db, id, viewerOf(current));
  if (!sheet) return new Response(null, { status: 404 });

  return pdfResponse(sheet.layout, sheet.date);
}
