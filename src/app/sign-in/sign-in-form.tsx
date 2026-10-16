"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth-client";

export function SignInForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sent) {
    return <p className="text-sm text-muted-foreground">Check your email for a sign-in link.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => authClient.signIn.social({ provider: "google", callbackURL: next })}
      >
        Continue with Google
      </Button>

      <div className="flex items-center gap-2">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">or</span>
        <Separator className="flex-1" />
      </div>

      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          setError(null);
          try {
            const { error: failure } = await authClient.signIn.magicLink({ email, callbackURL: next });
            if (failure) throw new Error(failure.message);
            setSent(true);
          } catch {
            setError("We couldn't send that link. Check the address and try again in a moment.");
          } finally {
            setPending(false);
          }
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={pending}>
          Email me a sign-in link
        </Button>
      </form>
    </div>
  );
}
