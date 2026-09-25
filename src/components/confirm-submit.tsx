"use client";

import type * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, type buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";

type ConfirmSubmitProps = {
  /** The `id` of the `<form>` this button confirms and submits (via the HTML `form` attribute). */
  formId: string;
  /** Label on the button that opens the confirmation dialog. */
  triggerLabel: React.ReactNode;
  /** Dialog title, e.g. "Cancel Event?" */
  title: string;
  /** Dialog body text. */
  description?: React.ReactNode;
  /** Label on the dialog's confirm button. */
  confirmLabel: React.ReactNode;
  /** Label on the dialog's cancel button. Defaults to "Cancel". */
  cancelLabel?: React.ReactNode;
  /** Hidden `name`/`value` submitted with the form when confirmed, e.g. name="action" value="cancel". */
  name?: string;
  value?: string;
  /** Styles the trigger and confirm buttons as destructive. Defaults to true. */
  destructive?: boolean;
  triggerVariant?: VariantProps<typeof buttonVariants>["variant"];
  triggerSize?: VariantProps<typeof buttonVariants>["size"];
  className?: string;
};

/**
 * A trigger button that opens an AlertDialog before submitting a destructive
 * action. The dialog's confirm button is an actual `type="submit"` button
 * associated with the enclosing form via the HTML `form` attribute (so it
 * works even though the dialog is portaled out of that form in the DOM),
 * carrying `name`/`value` into the submitted FormData.
 */
export function ConfirmSubmit({
  formId,
  triggerLabel,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  name,
  value,
  destructive = true,
  triggerVariant,
  triggerSize,
  className,
}: ConfirmSubmitProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant={triggerVariant ?? (destructive ? "destructive" : "default")}
            size={triggerSize}
            className={className}
          >
            {triggerLabel}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            type="submit"
            form={formId}
            name={name}
            value={value}
            variant={destructive ? "destructive" : "default"}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
