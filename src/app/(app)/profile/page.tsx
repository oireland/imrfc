import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CopyFeedUrl } from "@/components/copy-feed-url";
import { SignOutButton } from "@/components/sign-out-button";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { displayName, setName } from "@/features/users";
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

  async function saveName(formData: FormData) {
    "use server";
    const current = await requireApprovedUser();
    const result = await setName(db, current.id, String(formData.get("name")));
    if (!result.ok) redirect(`/profile?error=${encodeURIComponent(result.error)}`);
    revalidatePath("/", "layout");
    redirect("/profile?flash=name-saved");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-heading text-[40px] leading-none tracking-tight">{displayName(user)}</h2>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </div>

      <Card>
        <CardContent>
          <form action={saveName} className="flex flex-col gap-1.5">
            <Label htmlFor="profile-name">Your name</Label>
            {!user.name.trim() && (
              <p className="text-xs text-muted-foreground">Add your name so teammates know who has the kit.</p>
            )}
            <div className="flex gap-2">
              <Input id="profile-name" name="name" defaultValue={user.name} required autoComplete="name" className="flex-1" />
              <SubmitButton variant="secondary">Save</SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-heading text-[22px] leading-tight">Calendar Feed</h3>
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
