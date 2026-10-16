"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { errorMessage } from "@/lib/flash-messages";

const MESSAGES: Record<string, string> = {
  "event-created": "Event created",
};

/**
 * Shows a toast for a `?flash=<key>` (success) or `?error=<code>` (see flash-messages) left by a
 * server action's redirect, then strips the param so a refresh doesn't show it again.
 */
export function FlashToast() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const flash = params.get("flash");
  const error = params.get("error");

  useEffect(() => {
    if (!flash && !error) return;
    if (flash && MESSAGES[flash]) toast.success(MESSAGES[flash]);
    if (error) toast.error(errorMessage(error));
    const rest = new URLSearchParams(params);
    rest.delete("flash");
    rest.delete("error");
    router.replace(rest.size ? `${pathname}?${rest}` : pathname, { scroll: false });
  }, [flash, error, params, pathname, router]);

  return null;
}
