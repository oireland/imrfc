import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/session";

export default async function BlockedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (user.accessState !== "blocked") redirect("/");

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h2 className="text-center text-xl font-semibold">Access blocked</h2>
        </CardHeader>
        <CardContent>
          <p className="text-center text-sm text-muted-foreground">
            Your account has been Blocked. Contact a club Admin if you think this is a mistake.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
