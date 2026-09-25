import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/** A full-width "+ Add …" button at the foot of a list, linking to its create screen. */
export function AddLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={buttonVariants({ size: "lg", className: "h-11 w-full" })}>
      <Plus aria-hidden="true" />
      {children}
    </Link>
  );
}
