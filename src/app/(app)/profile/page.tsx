import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CopyFeedUrl } from "@/components/copy-feed-url";
import { SignOutButton } from "@/components/sign-out-button";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { getFeedToken, resetFeedToken } from "@/features/calendar-feed";
import { requireApprovedUser } from "@/lib/session";

export default async function ProfilePage() {
  const user = await requireApprovedUser();
  const token = await getFeedToken(db, user.id);
  const host = (await headers()).get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";
  const feedUrl = `${protocol}://${host}/api/feed/${token}.ics`;

  async function reset() {
    "use server";
    const current = await requireApprovedUser();
    await resetFeedToken(db, current.id);
    revalidatePath("/profile");
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{user.name}</h2>

      <Card>
        <CardHeader>
          <h3 className="font-heading text-base leading-snug font-medium">Calendar Feed</h3>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Subscribe to this URL in your calendar app to see every Event, with your own Duties in the
            description. Keep it private: anyone with the URL can see your feed.
          </p>
          <CopyFeedUrl url={feedUrl} />
          <form id="reset-feed-url" action={reset}>
            <ConfirmSubmit
              formId="reset-feed-url"
              triggerLabel="Reset feed URL"
              title="Reset feed URL?"
              description="The old Calendar Feed URL will stop working immediately. You'll need to re-subscribe with the new one."
              confirmLabel="Yes, reset"
              triggerVariant="outline"
              triggerSize="sm"
            />
          </form>
        </CardContent>
      </Card>

      <SignOutButton />
    </div>
  );
}
