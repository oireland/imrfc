import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** A "‹ Events"-style link back to the parent screen, shown above a page title. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="-ml-1 inline-flex items-center gap-0.5 self-start text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="size-4" aria-hidden="true" />
      {children}
    </Link>
  );
}
