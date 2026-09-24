import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/session";

export default async function WaitingForApprovalPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (user.accessState !== "pending") redirect("/");

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h2 className="text-center text-xl font-semibold">Waiting for approval</h2>
        </CardHeader>
        <CardContent>
          <p className="text-center text-sm text-muted-foreground">
            Your account is Pending approval from a club Admin. Check back soon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
