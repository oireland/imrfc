"use client";

import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button, type buttonVariants } from "./ui/button";
import type { VariantProps } from "class-variance-authority";

/** Shares this page: the phone's share sheet where there is one, otherwise copies the link. */
export function ShareButton({ title, size = "sm" }: { title: string; size?: VariantProps<typeof buttonVariants>["size"] }) {
  async function share() {
    const url = window.location.href.split("?")[0];
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // Closing the share sheet isn't an error worth showing.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  }

  return (
    <Button type="button" variant="outline" size={size} onClick={share}>
      <Share2 aria-hidden="true" />
      Share
    </Button>
  );
}
