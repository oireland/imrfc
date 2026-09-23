import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function BlockedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (user.accessState !== "blocked") redirect("/");

  return (
    <div className="mx-auto max-w-sm text-center">
      <h2 className="text-xl font-semibold">Access blocked</h2>
      <p className="mt-2 text-muted-foreground">
        Your account has been blocked. Contact a club Admin if you think this is a mistake.
      </p>
    </div>
  );
}
