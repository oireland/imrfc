"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import crest from "../../docs/brand/crest.png";

type Theme = "system" | "light" | "dark";

const OPTIONS: { key: Theme; label: string; icon: typeof Sun }[] = [
  { key: "system", label: "System", icon: Monitor },
  { key: "light", label: "Light", icon: Sun },
  { key: "dark", label: "Dark", icon: Moon },
];

/**
 * The club crest, which doubles as the colour-theme menu (System / Light / Dark).
 * Applies the choice to <html data-theme> straight away, then saves it to the User.
 */
export function CrestThemePicker({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(theme);
  const [, startTransition] = useTransition();
  const Badge = current === "dark" ? Moon : current === "light" ? Sun : Monitor;

  function choose(next: Theme) {
    setCurrent(next);
    setOpen(false);
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
    startTransition(() => onChange(next));
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Colour theme"
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative flex size-12 items-center justify-center rounded-full bg-tile p-1.5 shadow-card ring-1 ring-black/5 transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95"
      >
        <Image src={crest} alt="" className="size-9" priority />
        <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-foreground text-background ring-2 ring-background">
          <Badge className="size-3" aria-hidden="true" />
        </span>
      </button>
      {open && (
        <>
          <button type="button" aria-hidden="true" tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div
            role="menu"
            aria-label="Colour theme"
            className="absolute top-14 right-0 z-50 w-44 animate-in rounded-2xl bg-popover p-1.5 text-popover-foreground shadow-xl ring-1 ring-border duration-150 fade-in zoom-in-95"
          >
            <p className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Appearance</p>
            {OPTIONS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="menuitemradio"
                aria-checked={current === key}
                onClick={() => choose(key)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-muted"
              >
                <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1 text-left">{label}</span>
                {current === key && <Check className="size-4" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
