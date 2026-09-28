import { CircleAlert } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { HeadsUp } from "@/features/duties";

/** Heads-ups about the equipment plan: gentler than Clashes, never blocking. */
export function HeadsUpList({ headsUps }: { headsUps: HeadsUp[] }) {
  if (headsUps.length === 0) return null;
  return (
    <section aria-labelledby="heads-up">
      <Card>
        <CardHeader>
          <h3 id="heads-up" className="flex items-center gap-2 font-heading text-[22px] leading-tight">
            <CircleAlert className="size-4.5 text-muted-foreground" aria-hidden="true" />
            Heads up
          </h3>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm">
            {headsUps.map((h, i) => (
              <li key={i}>{h.message}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
