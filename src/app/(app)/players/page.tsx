import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { db } from "@/db/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listPlayers } from "@/features/players";
import type { PlayerRow } from "@/features/players";
import { isCommitteeOrAbove } from "@/features/users";
import { getCurrentUser } from "@/lib/session";

export default async function PlayersPage({ searchParams }: PageProps<"/players">) {
  const user = await getCurrentUser();
  if (!user || !isCommitteeOrAbove(user.role)) redirect("/");

  const { q } = await searchParams;
  const search = typeof q === "string" ? q : "";
  const listing = await listPlayers(db, search);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-heading text-[40px] leading-none tracking-tight">Players</h2>

      <form className="flex">
        <Input type="search" name="q" placeholder="Search players" defaultValue={search} aria-label="Search players" />
      </form>

      <Card className="py-0">
        <div className="divide-y divide-border">
          {listing.playing.length === 0 && <p className="p-4 text-muted-foreground">No players found.</p>}
          {listing.playing.map((p) => (
            <PlayerListRow key={p.id} player={p} />
          ))}
        </div>
      </Card>

      {listing.notPlaying.length > 0 && (
        <details className="group flex flex-col gap-2">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            Not playing ({listing.notPlaying.length})
          </summary>
          <Card className="mt-2 py-0">
            <div className="divide-y divide-border">
              {listing.notPlaying.map((p) => (
                <PlayerListRow key={p.id} player={p} />
              ))}
            </div>
          </Card>
        </details>
      )}
    </div>
  );
}

function PlayerListRow({ player }: { player: PlayerRow }) {
  return (
    <Link href={`/players/${player.id}`} className="flex items-center justify-between gap-2 px-4 py-3.5 hover:bg-muted/60">
      <div>
        <p className="font-medium">{player.name}</p>
        <p className="text-sm text-muted-foreground">{player.preferredPosition ?? "No position set"}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
