"use client";

import { useTransition } from "react";
import { toast } from "sonner";

type Result = { ok: true } | { ok: false; error: string };

/**
 * A form whose server action answers `{ ok, error }`. A failure shows the error as a toast and
 * leaves what was typed in place; a success resets the form. `children` is a render function so
 * the submit button can see the pending state.
 */
export function ResultForm({
  action,
  successMessage,
  resetOnSuccess = true,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<Result>;
  successMessage?: string;
  /** Clear the fields after a success (right for "add" forms, wrong for ones that edit a value in place). */
  resetOnSuccess?: boolean;
  className?: string;
  children: (pending: boolean) => React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        startTransition(async () => {
          const result = await action(data);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          if (successMessage) toast.success(successMessage);
          if (resetOnSuccess) form.reset();
        });
      }}
    >
      {children(pending)}
    </form>
  );
}
