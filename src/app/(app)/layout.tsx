import { requireApprovedUser } from "@/lib/session";
import { PendingBadge } from "./admin/pending-badge";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireApprovedUser();
  return (
    <div className="flex flex-col gap-4">
      <PendingBadge />
      {children}
    </div>
  );
}
