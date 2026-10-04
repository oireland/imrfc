"use client";

import { useState } from "react";
import { Download, FileText } from "lucide-react";
import type { SheetLayout } from "@/features/selection";
import { BottomSheet } from "@/components/bottom-sheet";

/** The full lineup as it would print, in a popup, with the PDF to export. */
export function TeamSheetDialog({ eventId, layout }: { eventId: string; layout: SheetLayout }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-border px-4 text-sm font-semibold"
      >
        <FileText className="size-4" aria-hidden="true" />
        Team sheet
      </button>

      {open && (
        <BottomSheet
          eyebrow="Team sheet"
          title={layout.title}
          onSubmit={(e) => {
            e.preventDefault();
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{layout.date}</p>
            {layout.details.length > 0 && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                {layout.details.map((d) => (
                  <div key={d.label} className="contents">
                    <dt className="font-semibold">{d.label}</dt>
                    <dd>{d.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {layout.sections.length > 0 ? (
              layout.sections.map((section) => (
                <table key={section.title} className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-foreground text-left">
                      <th className="w-10 py-1">No.</th>
                      <th>{section.title}</th>
                      <th>Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((r) => (
                      <tr key={r.shirt} className="border-b border-border">
                        <td className="py-1">{r.shirt}</td>
                        <td>{r.name}</td>
                        <td>{r.roles}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Nobody picked yet.</p>
            )}
            <p className="text-xs text-muted-foreground">{layout.legend}</p>
            <a
              href={`/events/${eventId}/team-sheet/pdf`}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground"
            >
              <Download className="size-4" aria-hidden="true" />
              Export to PDF
            </a>
          </div>
        </BottomSheet>
      )}
    </>
  );
}
