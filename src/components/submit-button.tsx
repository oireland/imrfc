"use client";

import type * as React from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button, type buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";

type SubmitButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    pendingLabel?: React.ReactNode;
  };

/**
 * A shadcn Button that disables itself and shows a spinner while its
 * enclosing form is submitting (via useFormStatus). Passes through
 * variant/size/name/value/children/aria props, so it works as a
 * server-action button with `name="action" value="claim"`.
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant,
  size,
  disabled,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant={variant} size={size} disabled={pending || disabled} {...props}>
      {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
