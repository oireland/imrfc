import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Crest } from "@/components/crest";
import { db } from "@/db/client";
import { getEvent } from "@/features/events";
import { formatWhen } from "@/lib/time/format-time";
import { signInErrorMessage } from "@/lib/auth/sign-in-error";
import { eventIdInPath, safeNextPath } from "@/lib/auth/next-path";
import type { Metadata } from "next";
import { SignInForm } from "./sign-in-form";

// A shared Event link lands here when signed out, so its preview (WhatsApp etc.) shows
// the Event's title and date — nothing else, no names or Venue.
export async function generateMetadata({ searchParams }: PageProps<"/sign-in">): Promise<Metadata> {
  const next = safeNextPath(firstParam((await searchParams).next));
  const eventId = eventIdInPath(next);
  const event = eventId ? await getEvent(db, eventId) : undefined;
  if (!event) return {};
  const when = formatWhen(event.start);
  return { title: event.title, description: when, openGraph: { title: event.title, description: when } };
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = safeNextPath(firstParam(params.next));
  const problem = signInErrorMessage(firstParam(params.error));
  const deleted = firstParam(params.deleted) === "1";
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6">
      <Crest />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h2 className="text-center font-heading text-4xl leading-none">Sign in</h2>
          {deleted && <p className="text-center text-sm text-muted-foreground">Your account has been deleted.</p>}
          {problem && <p role="alert" className="text-center text-sm text-destructive">{problem}</p>}
        </CardHeader>
        <CardContent>
          <SignInForm next={next} />
        </CardContent>
      </Card>
    </div>
  );
}
