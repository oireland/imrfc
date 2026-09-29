import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CopyFeedUrl } from "@/components/copy-feed-url";
import { SignOutButton } from "@/components/sign-out-button";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import { NotificationToggle } from "@/components/notification-toggle";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RUGBY_POSITIONS, displayName, setName, type RugbyPosition } from "@/features/users";
import { setPlayerPositions, setPlaying } from "@/features/players";
import { getFeedToken, resetFeedToken } from "@/features/calendar-feed";
import { isSubscribed, subscribe, unsubscribe } from "@/features/push";
import { requireApprovedUser } from "@/lib/session";

export default async function ProfilePage() {
  const user = await requireApprovedUser();
  const notificationsOn = await isSubscribed(db, user.id);
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

  async function savePositions(formData: FormData) {
    "use server";
    const current = await requireApprovedUser();
    const preferred = String(formData.get("preferred")) as RugbyPosition;
    const other = formData.getAll("other") as RugbyPosition[];
    await setPlayerPositions(db, current.id, preferred, other);
    revalidatePath("/profile");
  }

  async function togglePlaying(formData: FormData) {
    "use server";
    const current = await requireApprovedUser();
    await setPlaying(db, current.id, formData.get("playing") === "true");
    revalidatePath("/profile");
  }

  async function subscribeToPush(subscription: { endpoint: string; p256dh: string; auth: string }) {
    "use server";
    const current = await requireApprovedUser();
    await subscribe(db, { userId: current.id, subscription });
  }

  async function unsubscribeFromPush(endpoint: string) {
    "use server";
    const current = await requireApprovedUser();
    await unsubscribe(db, { userId: current.id, endpoint });
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
              <p className="text-xs text-muted-foreground">Add your name so teammates know who has the equipment.</p>
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
          <h3 className="font-heading text-[22px] leading-tight">Playing</h3>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={savePositions} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-preferred-position">Preferred Position</Label>
              <NativeSelect id="profile-preferred-position" name="preferred" defaultValue={user.preferredPosition ?? ""} required>
                <NativeSelectOption value="" disabled>
                  Choose a position
                </NativeSelectOption>
                {RUGBY_POSITIONS.map((position) => (
                  <NativeSelectOption key={position} value={position}>
                    {position}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-0.5 text-sm font-medium">Other Positions</legend>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {RUGBY_POSITIONS.map((position) => (
                  <label key={position} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="other" value={position} defaultChecked={user.otherPositions.includes(position)} />
                    {position}
                  </label>
                ))}
              </div>
            </fieldset>
            <SubmitButton variant="secondary" className="self-start">
              Save positions
            </SubmitButton>
          </form>

          <form action={togglePlaying}>
            <input type="hidden" name="playing" value={(!user.playing).toString()} />
            <SubmitButton variant="outline">{user.playing ? "Switch Playing off" : "Switch Playing on"}</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-heading text-[22px] leading-tight">Your calendar</h3>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Subscribe to this link in your calendar app to see every event, with your own duties written
            in. Keep it to yourself: anyone with the link can see your calendar.
          </p>
          <CopyFeedUrl url={feedUrl} />
          <form id="reset-feed-url" action={reset}>
            <ConfirmSubmit
              formId="reset-feed-url"
              triggerLabel="Reset link"
              title="Reset your calendar link?"
              description="The old link stops working straight away, so you'll need to subscribe again with the new one."
              confirmLabel="Yes, reset"
              triggerVariant="outline"
              triggerSize="sm"
            />
          </form>
        </CardContent>
      </Card>

      {process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && (
        <Card>
          <CardHeader>
            <h3 className="font-heading text-[22px] leading-tight">Notifications</h3>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Get a nudge on your phone the morning of anything you&rsquo;re on duty for or playing in, and whenever
              you&rsquo;re asked for your availability.
            </p>
            <NotificationToggle
              initiallySubscribed={notificationsOn}
              vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY}
              subscribe={subscribeToPush}
              unsubscribe={unsubscribeFromPush}
            />
          </CardContent>
        </Card>
      )}

      <SignOutButton />
    </div>
  );
}
