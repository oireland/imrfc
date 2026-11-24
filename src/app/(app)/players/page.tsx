import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { db } from "@/db/client";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { CopySummary } from "@/components/copy-summary";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatPhysioList, listFitness, listPhysioNeeds } from "@/features/injuries";
import { listPlayers } from "@/features/players";
import { londonDay } from "@/lib/time/london";
import type { PlayerRow } from "@/features/players";
import { formatDay } from "@/lib/time/format-time";
import { requireCommittee } from "@/lib/auth/session";

export default async function PlayersPage({ searchParams }: PageProps<"/players">) {
  await requireCommittee();

  const { q, away, injured } = await searchParams;
  const search = typeof q === "string" ? q : "";
  const awayOnly = away === "1";
  const injuredOnly = injured === "1";
  const today = londonDay();
  const [listing, physioNeeds] = await Promise.all([
    listPlayers(db, search, { today, awayOnly, injuredOnly, fitness: await listFitness(db, today) }),
    listPhysioNeeds(db),
  ]);
  const physioList = formatPhysioList(formatDay(new Date()), physioNeeds);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-heading text-[40px] leading-none tracking-tight">Players</h2>

      {listing.summary && <p className="-mt-2 text-sm text-muted-foreground">{listing.summary}</p>}

      <form className="flex flex-col gap-2">
        <Input type="search" name="q" placeholder="Search players" defaultValue={search} aria-label="Search players" />
        {awayOnly && <input type="hidden" name="away" value="1" />}
        {injuredOnly && <input type="hidden" name="injured" value="1" />}
        <div className="flex flex-wrap gap-1.5">
          <FilterChip href={filterHref(search, { away: awayOnly, injured: !injuredOnly })} pressed={injuredOnly}>
            Injured
          </FilterChip>
          <FilterChip href={filterHref(search, { away: !awayOnly, injured: injuredOnly })} pressed={awayOnly}>
            Away
          </FilterChip>
        </div>
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

      <CopySummary text={physioList} title="Physio Message" buttonLabel="Copy physio message" copiedMessage="Copied. Paste it to the physio." />
    </div>
  );
}

function filterHref(search: string, filters: { away: boolean; injured: boolean }) {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (filters.injured) params.set("injured", "1");
  if (filters.away) params.set("away", "1");
  return params.size ? `/players?${params}` : "/players";
}

function FilterChip({ href, pressed, children }: { href: string; pressed: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={pressed ? "true" : undefined}
      className={cn(
        "rounded-full border px-3 py-1.5 text-[13px] font-medium",
        pressed ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

const FITNESS_PILL = {
  out: "bg-out-tint text-destructive-text",
  training_only: "bg-train-tint text-train",
  playing_through: "bg-play-tint text-play",
} as const;

const FITNESS_LABEL = { out: "Out", training_only: "Training only", playing_through: "Playing through it" } as const;

function PlayerListRow({ player }: { player: PlayerRow }) {
  return (
    <Link href={`/players/${player.id}`} className="flex items-center justify-between gap-2 px-4 py-3.5 hover:bg-muted/60">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 font-medium">
          {player.name}
          {player.isNew && (
            <span className="size-2 shrink-0 rounded-full bg-accent">
              <span className="sr-only">New</span>
            </span>
          )}
        </p>
        <p className="text-sm text-muted-foreground">{player.injuryLine ?? player.preferredPosition ?? "No position set"}</p>
        {player.checkIn && <p className="text-xs font-semibold text-train">{player.checkIn}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {player.fitness && (
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", FITNESS_PILL[player.fitness])}>{FITNESS_LABEL[player.fitness]}</span>
        )}
        {player.awayLabel && <Badge variant="secondary">{player.awayLabel}</Badge>}
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
