import Link from "next/link";
import { isCommitteeOrAbove } from "@/features/users";
import { requireApprovedUser } from "@/lib/session";
import { PendingBadge } from "./admin/pending-badge";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireApprovedUser();
  return (
    <div className="flex flex-col gap-4">
      <nav className="flex items-center gap-4">
        <Link href="/">Home</Link>
        {isCommitteeOrAbove(user.role) && <Link href="/locations">Locations</Link>}
        {isCommitteeOrAbove(user.role) && <Link href="/kit">Kit</Link>}
        <PendingBadge />
      </nav>
      {children}
    </div>
  );
}
