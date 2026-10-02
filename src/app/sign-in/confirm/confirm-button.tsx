"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

// A button, not a link: only a real press sends the browser to the token-spending URL.
export function ConfirmButton({ verifyUrl }: { verifyUrl: string }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      className="w-full"
      disabled={pending}
      onClick={() => {
        setPending(true);
        window.location.assign(verifyUrl);
      }}
    >
      Sign in
    </Button>
  );
}
