"use client";

import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";

/** Shares this page: the phone's share sheet where there is one, otherwise copies the link. */
export function ShareButton({ title }: { title: string }) {
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
    <Button type="button" variant="outline" size="sm" onClick={share}>
      <Share2 aria-hidden="true" />
      Share
    </Button>
  );
}
