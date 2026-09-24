"use client";

import { useState } from "react";

/** Duty Summary: previews the WhatsApp text and copies it to the clipboard. */
export function CopySummary({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
      <h3 className="font-medium">Duty Summary</h3>
      <pre className="whitespace-pre-wrap text-muted-foreground">{text}</pre>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        }}
        className="self-start rounded-md bg-primary px-3 py-1 text-primary-foreground"
      >
        {copied ? "Copied" : "Copy WhatsApp message"}
      </button>
    </div>
  );
}
