import type { Clash } from "@/features/duties";

/** Clash warnings: shown, never blocking. */
export function ClashList({ clashes }: { clashes: Clash[] }) {
  if (clashes.length === 0) return null;
  return (
    <div role="alert" className="flex flex-col gap-1 rounded-md border border-destructive p-3 text-sm">
      <h3 className="font-medium text-destructive">Clashes</h3>
      <ul className="flex flex-col gap-1">
        {clashes.map((c, i) => (
          <li key={i} className="text-destructive">
            ⚠ {c.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
