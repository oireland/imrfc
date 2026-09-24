"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await authClient.signOut();
        router.push("/sign-in");
      }}
      className="self-start rounded-md border border-border px-3 py-1"
    >
      Sign out
    </button>
  );
}
