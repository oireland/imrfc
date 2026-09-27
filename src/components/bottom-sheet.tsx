"use client";

import { Loader2, X } from "lucide-react";

/**
 * A form that slides up from the bottom of the screen, like Google Calendar's "New event".
 * `eyebrow` is the small caps label at the top; `title` optionally sits under it.
 */
export function BottomSheet({
  eyebrow,
  title,
  onSubmit,
  onClose,
  children,
}: {
  eyebrow: string;
  title?: string | null;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="bottom-sheet-title">
      <button type="button" aria-label="Close" className="absolute inset-0 animate-in bg-black/50 backdrop-blur-sm fade-in" onClick={onClose} />
      <form
        onSubmit={onSubmit}
        className="relative max-h-[92dvh] w-full max-w-2xl animate-in overflow-y-auto rounded-t-[28px] bg-popover px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+20px)] font-sans text-popover-foreground shadow-2xl duration-300 slide-in-from-bottom"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p id={title ? undefined : "bottom-sheet-title"} className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {eyebrow}
            </p>
            {title && (
              <p id="bottom-sheet-title" className="text-lg font-semibold">
                {title}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full bg-muted p-2">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </form>
    </div>
  );
}

/** The sheet's full-width Save button. */
export function SheetSaveButton({ pending }: { pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      Save
    </button>
  );
}
