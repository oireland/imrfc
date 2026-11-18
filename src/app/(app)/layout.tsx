import { Suspense } from "react";
import { db } from "@/db/client";
import { FlashToast } from "@/components/flash-toast";
import { BottomTabs } from "@/components/bottom-tabs";
import { OnboardingDialog } from "@/components/onboarding-dialog";
import { canManageUsers, countPendingUsers, isCommitteeOrAbove } from "@/features/users";
import { hasMobileNumber } from "@/features/contact";
import { needsOnboarding } from "@/features/onboarding";
import { requireApprovedUser } from "@/lib/auth/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireApprovedUser();
  const pendingCount = canManageUsers(user.role) ? await countPendingUsers(db) : 0;
  const showAdmin = isCommitteeOrAbove(user.role);
  const onboarding = needsOnboarding({ ...user, hasMobileNumber: await hasMobileNumber(db, user.id) });

  return (
    <div className="flex flex-col">
      <div className="mx-auto w-full max-w-2xl pb-24">{children}</div>
      <Suspense>
        <FlashToast />
      </Suspense>
      <BottomTabs showAdmin={showAdmin} pendingCount={pendingCount} />
      {onboarding && (
        <OnboardingDialog name={user.name} preferredPosition={user.preferredPosition} showAdmin={showAdmin} />
      )}
    </div>
  );
}
