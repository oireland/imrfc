"use client";

import { useState } from "react";

/** Calendar Feed URL with a copy button. */
export function CopyFeedUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <code className="break-all rounded-md border border-border p-2">{url}</code>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
        }}
        className="self-start rounded-md bg-primary px-3 py-1 text-primary-foreground"
      >
        {copied ? "Copied" : "Copy feed URL"}
      </button>
    </div>
  );
}
