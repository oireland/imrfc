"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, House, Package, ShieldCheck, User, Users } from "lucide-react";
import { cn } from "cn";

export type BottomTabsProps = {
  /** Whether the signed-in User is Committee or above; shows the Admin tab. */
  showAdmin: boolean;
  /** Pending-approval count shown as a badge on the Admin tab; only meaningful for Admins. */
  pendingCount?: number;
};

type Tab = {
  href: string;
  label: string;
  icon: typeof House;
  isActive: (pathname: string) => boolean;
};

const TABS: Tab[] = [
  { href: "/", label: "Home", icon: House, isActive: (p) => p === "/" },
  { href: "/events", label: "Events", icon: CalendarDays, isActive: (p) => p.startsWith("/events") },
  { href: "/equipment", label: "Equipment", icon: Package, isActive: (p) => p.startsWith("/equipment") },
  { href: "/profile", label: "Profile", icon: User, isActive: (p) => p.startsWith("/profile") },
];

const COMMITTEE_TABS: Tab[] = [
  { href: "/players", label: "Players", icon: Users, isActive: (p) => p.startsWith("/players") },
  { href: "/admin", label: "Admin", icon: ShieldCheck, isActive: (p) => p.startsWith("/admin") || p.startsWith("/stores") },
];

/** The fixed, frosted bottom tab bar: Home, Events, Equipment, Profile, plus Players and Admin for Committee and above. */
export function BottomTabs({ showAdmin, pendingCount = 0 }: BottomTabsProps) {
  const pathname = usePathname();
  const tabs = showAdmin ? [TABS[0], TABS[1], TABS[2], COMMITTEE_TABS[0], COMMITTEE_TABS[1], TABS[3]] : TABS;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-2xl items-stretch justify-around py-1.5">
        {tabs.map(({ href, label, icon: Icon, isActive }) => {
          const active = isActive(pathname);
          return (
            <Link
              key={href}
              href={href}
              // The tab bar is always on screen, so fetch each tab's whole page up front and tapping one shows it at once.
              prefetch={true}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-1 px-1 py-1 text-[11px] font-medium",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.6} aria-hidden="true" />
              {label}
              <span className={cn("size-1 rounded-full", active ? "bg-accent" : "bg-transparent")} aria-hidden="true" />
              {label === "Admin" && pendingCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 left-1/2 ml-2 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-background"
                >
                  {pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
