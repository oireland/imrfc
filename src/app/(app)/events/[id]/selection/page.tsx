import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { BackLink } from "@/components/back-link";
import { SelectionBoard } from "@/components/selection-board";
import { getEvent } from "@/features/events";
import { getBoard, getNaming } from "@/features/selection";
import { displayName, isCommitteeOrAbove } from "@/features/users";
import { requireApprovedUser } from "@/lib/session";
import { add, clear, dismissTeamNotice, guest, nameTeam, pick, remove, sendTeamChanges, swap } from "./actions";

export default async function SelectionPage({ params }: PageProps<"/events/[id]/selection">) {
  const { id } = await params;
  const current = await requireApprovedUser();
  const viewer = { id: current.id, committee: isCommitteeOrAbove(current.role) };
  const [board, event] = await Promise.all([getBoard(db, id, viewer), getEvent(db, id)]);
  if (!board || !event) notFound();
  const namings = Object.fromEntries(await Promise.all(board.pitches.map(async (p) => [p.eventId, await getNaming(db, p.eventId, viewer)] as const)));

  return (
    <div className="flex flex-col gap-4">
      <BackLink href={`/events/${id}`}>{event.title}</BackLink>
      <div className="flex items-end justify-between gap-3">
        <h1 className="font-heading text-[32px] leading-none">Pick the team</h1>
        <Link href={`/events/${id}/team-sheet`} className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold">
          Team sheet
        </Link>
      </div>
      <SelectionBoard
        board={board}
        namings={namings}
        openEventId={id}
        meName={displayName(current)}
        actions={{ pick, guest, clear, swap, add, remove }}
        namingActions={{ name: nameTeam, sendChanges: sendTeamChanges, dismiss: dismissTeamNotice }}
      />
    </div>
  );
}
