import { TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Clash } from "@/features/duties";

/** Clash warnings: shown, never blocking. */
export function ClashList({ clashes }: { clashes: Clash[] }) {
  if (clashes.length === 0) return null;
  return (
    <Card role="alert" className="border-destructive/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          Clashes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1 text-sm text-destructive">
          {clashes.map((c, i) => (
            <li key={i}>{c.message}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
