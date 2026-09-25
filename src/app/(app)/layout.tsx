import { Suspense } from "react";
import { db } from "@/db/client";
import { FlashToast } from "@/components/flash-toast";
import { BottomTabs } from "@/components/bottom-tabs";
import { canManageUsers, isCommitteeOrAbove, listPendingUsers } from "@/features/users";
import { requireApprovedUser } from "@/lib/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireApprovedUser();
  const pendingCount = canManageUsers(user.role) ? (await listPendingUsers(db)).length : 0;

  return (
    <div className="flex flex-col">
      <div className="mx-auto w-full max-w-2xl pb-24">{children}</div>
      <Suspense>
        <FlashToast />
      </Suspense>
      <BottomTabs showAdmin={isCommitteeOrAbove(user.role)} pendingCount={pendingCount} />
    </div>
  );
}
