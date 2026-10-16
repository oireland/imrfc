import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { db } from "@/db/client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { canManageUsers, countPendingUsers } from "@/features/users";
import { requireCommittee } from "@/lib/session";

const LINKS = [
  { href: "/stores", label: "Stores" },
  { href: "/admin/equipment", label: "Equipment" },
  { href: "/admin/series", label: "Series" },
  { href: "/admin/checklists", label: "Checklists" },
  { href: "/admin/users", label: "Users" },
] as const;

export default async function AdminPage() {
  const user = await requireCommittee();

  const pendingCount = canManageUsers(user.role) ? await countPendingUsers(db) : 0;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-heading text-[40px] leading-none tracking-tight">Admin</h2>
      <Card className="gap-0 divide-y divide-border py-0">
        {LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="flex h-14 items-center justify-between gap-2 px-4 hover:bg-muted"
          >
            <span>{label}</span>
            <span className="flex items-center gap-2">
              {label === "Users" && pendingCount > 0 && (
                <Badge variant="destructive">{pendingCount} pending</Badge>
              )}
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
            </span>
          </Link>
        ))}
      </Card>
    </div>
  );
}
