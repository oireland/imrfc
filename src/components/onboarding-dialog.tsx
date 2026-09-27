"use client";

import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/submit-button";
import { RUGBY_POSITIONS, type RugbyPosition } from "@/features/users";
import { completeOnboarding, type OnboardingState } from "@/app/(app)/onboarding-actions";

const DISMISSED_KEY = "imrfc-onboarding-dismissed";

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

// sessionStorage never changes from outside this tab, so there's nothing to subscribe to;
// useSyncExternalStore just gives us a mismatch-safe read of it on the client after hydration.
function subscribeNever() {
  return () => {};
}

const GUIDE = [
  { label: "Home", body: "Your duties, what's coming up, and any kit you're holding." },
  { label: "Kit", body: "Where every kit unit is right now, and who's got it." },
  { label: "Profile", body: "Your name, position, calendar feed, and theme." },
] as const;

export function OnboardingDialog({
  name,
  preferredPosition,
  showAdmin,
}: {
  name: string;
  preferredPosition: RugbyPosition | null;
  showAdmin: boolean;
}) {
  const [state, formAction] = useActionState<OnboardingState, FormData>(completeOnboarding, null);
  const [dismissedThisClick, setDismissedThisClick] = useState(false);
  const dismissedEarlier = useSyncExternalStore(subscribeNever, readDismissed, () => true);
  const completed = state?.ok === true;
  const open = !dismissedEarlier && !dismissedThisClick && !completed;

  useEffect(() => {
    if (completed) toast.success("You're all set");
  }, [completed]);

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // sessionStorage may be unavailable (private mode); the dialog just reopens next time.
    }
    setDismissedThisClick(true);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && dismiss()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Welcome to the club</DialogTitle>
          <DialogDescription>Tell us who you are so teammates know who&apos;s who.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="onboarding-name">Your name</Label>
            <Input id="onboarding-name" name="name" defaultValue={name} required autoComplete="name" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="onboarding-position">Your position</Label>
            <NativeSelect
              id="onboarding-position"
              name="position"
              defaultValue={preferredPosition ?? ""}
              required
              className="w-full"
            >
              <NativeSelectOption value="" disabled>
                Choose a position
              </NativeSelectOption>
              {RUGBY_POSITIONS.map((position) => (
                <NativeSelectOption key={position} value={position}>
                  {position}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          {state && !state.ok && (
            <p role="alert" className="text-sm text-destructive-text">
              {state.error}
            </p>
          )}

          <Collapsible>
            <CollapsibleTrigger
              render={
                <button
                  type="button"
                  className="text-left text-sm font-medium text-muted-foreground underline underline-offset-3"
                />
              }
            >
              What&apos;s in each tab?
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 flex flex-col gap-1.5">
              {GUIDE.map(({ label, body }) => (
                <p key={label} className="text-sm">
                  <span className="font-medium">{label}</span> — {body}
                </p>
              ))}
              {showAdmin && (
                <>
                  <p className="text-sm">
                    <span className="font-medium">Players</span> — everyone&apos;s position and duty record.
                  </p>
                  <p className="text-sm">
                    <span className="font-medium">Admin</span> — pending users, stores, kit units, events and
                    checklists.
                  </p>
                </>
              )}
            </CollapsibleContent>
          </Collapsible>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={dismiss}>
              Not now
            </Button>
            <SubmitButton>Save</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
