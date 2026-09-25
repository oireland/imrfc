"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Calendar Feed URL with a copy button. */
export function CopyFeedUrl({ url }: { url: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <code className="break-all rounded-md border border-border bg-muted p-2">{url}</code>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          toast("Link copied");
        }}
      >
        Copy link
      </Button>
    </div>
  );
}
