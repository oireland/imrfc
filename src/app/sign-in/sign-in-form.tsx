"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  if (sent) {
    return <p className="text-sm text-muted-foreground">Check your email for a sign-in link.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground"
        onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/" })}
      >
        Continue with Google
      </button>

      <form
        className="flex flex-col gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          await authClient.signIn.magicLink({ email, callbackURL: "/" });
          setSent(true);
        }}
      >
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-md border border-border px-3 py-2"
        />
        <button
          type="submit"
          className="rounded-md border border-primary px-4 py-2 font-medium text-primary"
        >
          Email me a sign-in link
        </button>
      </form>
    </div>
  );
}
