"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Previews a WhatsApp text (Duty Summary, Physio Summary) and copies it to the clipboard. */
export function CopySummary({
  text,
  title = "WhatsApp message",
  buttonLabel = "Copy WhatsApp message",
  copiedMessage = "Copied. Paste it into the club group.",
}: {
  text: string;
  title?: string;
  buttonLabel?: string;
  copiedMessage?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <pre className="whitespace-pre-wrap text-sm text-muted-foreground">{text}</pre>
        <Button
          type="button"
          className="self-start"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            toast(copiedMessage);
          }}
        >
          {buttonLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
