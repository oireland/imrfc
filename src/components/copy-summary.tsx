"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Duty Summary: previews the WhatsApp text and copies it to the clipboard. */
export function CopySummary({ text }: { text: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Duty Summary</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <pre className="whitespace-pre-wrap text-sm text-muted-foreground">{text}</pre>
        <Button
          type="button"
          className="self-start"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            toast("Copied");
          }}
        >
          Copy WhatsApp message
        </Button>
      </CardContent>
    </Card>
  );
}
