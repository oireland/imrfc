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
        <Link href="/events">Events</Link>
        <Link href="/kit">Kit</Link>
        {isCommitteeOrAbove(user.role) && <Link href="/locations">Locations</Link>}
        {isCommitteeOrAbove(user.role) && <Link href="/admin/kit">Kit Units</Link>}
        {isCommitteeOrAbove(user.role) && <Link href="/admin/events">Events Admin</Link>}
        {isCommitteeOrAbove(user.role) && <Link href="/admin/series">Series</Link>}
        {isCommitteeOrAbove(user.role) && <Link href="/admin/checklists">Checklists</Link>}
        <Link href="/profile">Profile</Link>
        <PendingBadge />
      </nav>
      {children}
    </div>
  );
}
