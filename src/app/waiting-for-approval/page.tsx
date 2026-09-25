import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Crest } from "@/components/crest";
import { getCurrentUser } from "@/lib/session";

export default async function WaitingForApprovalPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (user.accessState !== "pending") redirect("/");

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6">
      <Crest />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h2 className="text-center font-heading text-4xl leading-none">Waiting for approval</h2>
        </CardHeader>
        <CardContent>
          <p className="text-center text-sm text-muted-foreground">
            Thanks for signing up. A club admin needs to let you in. Check back soon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
