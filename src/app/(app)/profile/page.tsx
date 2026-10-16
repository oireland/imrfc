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
import { MobileNumberField } from "@/components/mobile-number-field";
import { ProfileNameField } from "@/components/profile-name-field";
import { AwayCard } from "@/components/away-card";
import { InjuriesCard } from "@/components/injuries-card";
import { PositionsPicker } from "@/components/positions-picker";
import { displayName, setName, type RugbyPosition } from "@/features/users";
import { listInjuries } from "@/features/injuries";
import { listAway, londonToday, setPlayerPositions, setPlaying } from "@/features/players";
import { getMobileNumber, setMobileNumber } from "@/features/contact";
import { getFeedToken, resetFeedToken } from "@/features/calendar-feed";
import { isSubscribed, subscribe, unsubscribe } from "@/features/push";
import { deleteAccount } from "@/features/account-deletion";
import { requireApprovedUser } from "@/lib/session";
import { addAwayAction, editAwayAction, imBackAction, removeAwayAction } from "../away-actions";
import { awayItems } from "../away-items";
import { recentEventOptions } from "../injury-events";
import { clearInjuryAction, logByMistakeAction, reportInjuryAction, updateInjuryAction } from "../injury-actions";
import { injuryItems } from "../injury-items";

export default async function ProfilePage() {
  const user = await requireApprovedUser();
  const notificationsOn = await isSubscribed(db, user.id);
  const mobileNumber = await getMobileNumber(db, user, user.id);
  const token = await getFeedToken(db, user.id);
  const today = londonToday();
  const away = awayItems(await listAway(db, user, user.id, today), user.id);
  const injuries = await listInjuries(db, user, user.id, today);
  const eventOptions = await recentEventOptions();
  const host = (await headers()).get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";
  const feedUrl = `${protocol}://${host}/api/feed/${token}.ics`;

  async function reset() {
    "use server";
    const current = await requireApprovedUser();
    await resetFeedToken(db, current.id);
    revalidatePath("/profile");
  }

  async function saveName(name: string) {
    "use server";
    const current = await requireApprovedUser();
    const result = await setName(db, current.id, name);
    if (result.ok) revalidatePath("/", "layout");
    return result;
  }

  async function saveMobileNumber(input: string) {
    "use server";
    const current = await requireApprovedUser();
    const result = await setMobileNumber(db, current, current.id, input);
    if (result.ok) revalidatePath("/", "layout");
    return result;
  }

  async function savePositions(preferred: RugbyPosition, other: RugbyPosition[]) {
    "use server";
    const current = await requireApprovedUser();
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

  async function deleteMyAccount() {
    "use server";
    const current = await requireApprovedUser();
    const result = await deleteAccount(db, { actor: current, userId: current.id });
    if (!result.ok) redirect(`/profile?error=${result.code}`);
    redirect("/sign-in?deleted=1");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-heading text-[40px] leading-none tracking-tight">{displayName(user)}</h2>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </div>

      <Card>
        <CardContent>
          <ProfileNameField initialName={user.name} save={saveName} />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <MobileNumberField
            id="profile-mobile"
            label="Your mobile number"
            hint="Only Committee see this — it's so they can message you about availability."
            initialNumber={mobileNumber}
            save={saveMobileNumber}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-heading text-[22px] leading-tight">Playing</h3>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <PositionsPicker
            initialPreferred={user.preferredPosition as RugbyPosition | null}
            initialOther={user.otherPositions as RugbyPosition[]}
            save={savePositions}
          />

          <form action={togglePlaying}>
            <input type="hidden" name="playing" value={(!user.playing).toString()} />
            <SubmitButton variant="outline">{user.playing ? "Switch Playing off" : "Switch Playing on"}</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <InjuriesCard
        title="My injuries"
        open={injuryItems(injuries.open)}
        cleared={injuryItems(injuries.history)}
        today={today}
        events={eventOptions}
        emptyText="Nothing hurting. If you pick something up, say so here and committee will know."
        actions={{
          report: reportInjuryAction.bind(null, user.id),
          update: updateInjuryAction,
          clear: clearInjuryAction,
          mistake: logByMistakeAction,
        }}
      />

      <AwayCard
        title="Time away"
        {...away}
        today={today}
        emptyText="Exams or a holiday? Say when you'll be away and nobody will chase you."
        actions={{
          add: addAwayAction.bind(null, user.id),
          edit: editAwayAction,
          imBack: imBackAction,
          remove: removeAwayAction,
        }}
      />
      <p className="px-1 text-sm text-muted-foreground">Injuries and time away you record are seen by committee.</p>

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
          <p className="text-sm text-muted-foreground">
            Not sure how? Here&rsquo;s how in{" "}
            <a
              href="https://support.google.com/calendar/answer/37100"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline underline-offset-3"
            >
              Google Calendar
            </a>{" "}
            (use &ldquo;From URL&rdquo; on a computer) and{" "}
            <a
              href="https://support.apple.com/102301"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline underline-offset-3"
            >
              Apple Calendar
            </a>
            .
          </p>
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

      <SignOutButton />

      <Card>
        <CardHeader>
          <h3 className="font-heading text-[22px] leading-tight">Delete your account</h3>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            This can&rsquo;t be undone. Your name, email and sign-in are wiped and you&rsquo;re taken off any
            upcoming duties. Equipment moves and past duties stay in the club&rsquo;s records as &ldquo;Deleted
            user&rdquo;.
          </p>
          <form id="delete-account" action={deleteMyAccount}>
            <ConfirmSubmit
              formId="delete-account"
              triggerLabel="Delete account"
              title="Delete your account for good?"
              description="You'll be signed out straight away and can't get this account back. Hand back any equipment you've got first, or it'll show as with a deleted user."
              confirmLabel="Yes, delete it"
              triggerVariant="outline"
              triggerSize="sm"
            />
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
