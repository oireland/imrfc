"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "cn";

export type EventTab = { id: string; label: string; count?: number; content: ReactNode };

/**
 * Event detail's sections as tabs. Every panel stays mounted (just hidden) so open sheets and
 * half-typed replies survive a tab change. The tab lives in the URL (`?tab=kit`) so it can be shared.
 */
export function EventTabs({ tabs }: { tabs: EventTab[] }) {
  const searchParams = useSearchParams();
  const wanted = searchParams.get("tab");
  const current = tabs.find((t) => t.id === wanted)?.id ?? tabs[0]?.id;

  function show(id: string) {
    // Replace rather than push, so Back leaves the page instead of stepping through tabs.
    const next = new URLSearchParams(searchParams);
    next.set("tab", id);
    window.history.replaceState(null, "", `${window.location.pathname}?${next}`);
  }

  if (tabs.length === 0) return null;
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Event sections" className="flex rounded-full bg-muted p-1 text-[13px] font-semibold">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={current === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => show(t.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 whitespace-nowrap transition-colors",
              current === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular-nums",
                  current === t.id ? "bg-accent text-accent-foreground" : "bg-muted-foreground/15",
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={current !== t.id}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
