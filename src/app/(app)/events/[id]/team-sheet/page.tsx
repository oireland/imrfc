import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { BackLink } from "@/components/back-link";
import { TeamSheetEditor } from "@/components/team-sheet-editor";
import { getTeamSheet } from "@/features/selection";
import { isCommitteeOrAbove } from "@/features/users";
import { requireApprovedUser } from "@/lib/session";
import { roles, save } from "./actions";

export default async function TeamSheetPage({ params }: PageProps<"/events/[id]/team-sheet">) {
  const { id } = await params;
  const current = await requireApprovedUser();
  const sheet = await getTeamSheet(db, id, { id: current.id, committee: isCommitteeOrAbove(current.role) });
  if (!sheet) notFound();

  return (
    <div className="flex flex-col gap-4">
      <BackLink href={`/events/${id}/selection`}>Pick the team</BackLink>
      <h1 className="font-heading text-[32px] leading-none">Team sheet</h1>
      <TeamSheetEditor sheet={sheet} actions={{ save, roles }} />
    </div>
  );
}
