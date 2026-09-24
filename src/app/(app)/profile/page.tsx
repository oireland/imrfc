import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { CopyFeedUrl } from "@/components/copy-feed-url";
import { SignOutButton } from "@/components/sign-out-button";
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
    <main className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{user.name}</h1>
      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Calendar Feed</h2>
        <p className="text-sm text-muted-foreground">
          Subscribe to this URL in your calendar app to see every Event, with your own Duties in the description.
          Keep it private: anyone with the URL can see your feed.
        </p>
        <CopyFeedUrl url={feedUrl} />
        <form action={reset}>
          <button type="submit" className="rounded-md border border-border px-3 py-1 text-sm">
            Reset feed URL
          </button>
        </form>
      </section>
      <SignOutButton />
    </main>
  );
}
