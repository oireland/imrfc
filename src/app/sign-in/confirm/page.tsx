import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Crest } from "@/components/crest";
import { verifyUrlFromConfirmParams } from "@/lib/auth/sign-in-confirm";
import { ConfirmButton } from "./confirm-button";

export default async function ConfirmSignInPage({ searchParams }: PageProps<"/sign-in/confirm">) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value);
  }
  const verifyUrl = verifyUrlFromConfirmParams(params);
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6">
      <Crest />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h2 className="text-center font-heading text-4xl leading-none">Nearly there</h2>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {verifyUrl ? (
            <>
              <p className="text-center text-sm text-muted-foreground">Tap the button to finish signing in.</p>
              <ConfirmButton verifyUrl={verifyUrl} />
            </>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              That link looks incomplete. Ask for a new one from the sign-in page.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
