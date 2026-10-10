"use client";

import { useState } from "react";

/**
 * My own health cards (injuries, time away) as one stack: collapsed it shows the top card with
 * two card edges behind it and a "+N more" badge; tapping the top card, or the badge, opens
 * them all, and "Show less" folds them back. Cards come most urgent first.
 */
export function HealthStack({ cards }: { cards: React.ReactNode[] }) {
  const [open, setOpen] = useState(false);
  if (cards.length === 0) return null;
  const more = cards.length - 1;
  const collapsed = more > 0 && !open;

  return (
    <section aria-label="Your health" className="flex flex-col gap-2.5">
      <div
        className={collapsed ? "relative pb-4" : "flex flex-col gap-2.5"}
        onClick={(e) => {
          if (more > 0 && !open && !(e.target as HTMLElement).closest("button, a, input")) setOpen(true);
        }}
      >
        {collapsed && (
          <>
            <div aria-hidden="true" className="absolute inset-x-3 bottom-[7px] h-10 rounded-b-[22px] bg-social opacity-70 shadow-card" />
            <div aria-hidden="true" className="absolute inset-x-6 bottom-0 h-10 rounded-b-[22px] bg-social opacity-40 shadow-card" />
          </>
        )}
        {collapsed ? (
          <div className="relative z-10">
            {cards[0]}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="absolute right-3.5 bottom-3 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground"
            >
              +{more} more
            </button>
          </div>
        ) : (
          cards.map((card, i) => <div key={i}>{card}</div>)
        )}
      </div>
      {open && more > 0 && (
        <button type="button" onClick={() => setOpen(false)} className="self-center text-[13px] font-semibold underline underline-offset-3">
          Show less
        </button>
      )}
    </section>
  );
}

/** One gold-tinted card in the health stack. */
export function HealthCard({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2 rounded-[22px] bg-social p-4 text-social-foreground shadow-card">{children}</div>;
}
