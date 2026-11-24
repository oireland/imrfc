import { Download } from "lucide-react";
import type { TeamCard as Card } from "@/features/selection";
import { formatDay } from "@/lib/time/format-time";

/** Event detail's Team card: the team as last sent, for everyone signed in, with the PDF. */
export function TeamCard({ card }: { card: Card }) {
  const { layout } = card;
  return (
    <section aria-labelledby="team-card" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 id="team-card" className="font-heading text-[28px] leading-none">
          The team
        </h2>
        <span className="text-sm text-muted-foreground">
          Notified {formatDay(card.named.at)} by {card.named.by}
        </span>
      </div>
      <div className="flex flex-col gap-4 rounded-3xl bg-card px-4 py-4 shadow-card">
        {card.mine !== null && (
          <p className="rounded-2xl bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground">
            {card.mine > 15 ? `You're on the bench (${card.mine}).` : `You're at ${card.mine}.`}
          </p>
        )}
        <div>
          <p className="font-semibold">{layout.title}</p>
          <p className="text-xs text-muted-foreground">{layout.date}</p>
        </div>
        {layout.details.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {layout.details.map((d) => (
              <div key={d.label} className="contents">
                <dt className="text-muted-foreground">{d.label}</dt>
                <dd>{d.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {layout.sections.map((section) => (
          <div key={section.title} className="flex flex-col gap-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</h3>
            <ol className="flex flex-col divide-y divide-border text-sm">
              {section.rows.map((row) => (
                <li key={row.shirt} className="flex items-baseline gap-3 py-1.5">
                  <span className="w-6 text-center font-heading text-lg leading-none">{row.shirt}</span>
                  <span className="flex-1 font-semibold">{row.name}</span>
                  {row.roles && <span className="text-xs text-muted-foreground">{row.roles}</span>}
                </li>
              ))}
            </ol>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">{layout.legend}</p>
        <a
          href={`/events/${card.eventId}/team/pdf`}
          className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-border text-sm font-semibold"
        >
          <Download className="size-4" aria-hidden="true" />
          Download PDF
        </a>
      </div>
    </section>
  );
}
