"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, House, Package, ShieldCheck, User } from "lucide-react";
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
  { href: "/kit", label: "Kit", icon: Package, isActive: (p) => p.startsWith("/kit") },
  { href: "/profile", label: "Profile", icon: User, isActive: (p) => p.startsWith("/profile") },
];

const ADMIN_TAB: Tab = {
  href: "/admin",
  label: "Admin",
  icon: ShieldCheck,
  isActive: (p) => p.startsWith("/admin") || p.startsWith("/locations"),
};

/** The fixed bottom tab bar: Home, Events, Kit, Profile, plus Admin for Committee and above. */
export function BottomTabs({ showAdmin, pendingCount = 0 }: BottomTabsProps) {
  const pathname = usePathname();
  const tabs = showAdmin ? [...TABS, ADMIN_TAB] : TABS;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex max-w-2xl items-stretch justify-around">
        {tabs.map(({ href, label, icon: Icon, isActive }) => {
          const active = isActive(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className="flex flex-1 items-center justify-center px-1 py-2"
            >
              <span
                className={cn(
                  "relative flex flex-col items-center gap-0.5 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground",
                  active && "bg-accent text-accent-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {label}
                {label === "Admin" && pendingCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground"
                  >
                    {pendingCount}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
