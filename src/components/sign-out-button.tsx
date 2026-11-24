"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";
import { unsubscribeThisDevice } from "@/lib/messaging/push-client";

/** Signing out also stops this device getting notifications for the account. */
export function SignOutButton({ unsubscribe }: { unsubscribe: (endpoint: string) => Promise<void> }) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="outline"
      className="self-start"
      onClick={async () => {
        await unsubscribeThisDevice(unsubscribe);
        await authClient.signOut();
        router.push("/sign-in");
      }}
    >
      Sign out
    </Button>
  );
}
