import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function WaitingForApprovalPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (user.accessState !== "pending") redirect("/");

  return (
    <div className="mx-auto max-w-sm text-center">
      <h2 className="text-xl font-semibold">Waiting for approval</h2>
      <p className="mt-2 text-muted-foreground">
        Your account is pending approval from a club Admin. Check back soon.
      </p>
    </div>
  );
}
