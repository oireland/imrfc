"use client";

import { createContext, useContext, useTransition } from "react";
import { toast } from "sonner";
import type { Result } from "@/lib/result";


const ResultFormPending = createContext(false);

/** Whether the enclosing ResultForm is waiting on its action. */
export function useResultFormPending() {
  return useContext(ResultFormPending);
}

/**
 * A form whose server action answers `{ ok, error }`. A failure shows the error as a toast and
 * leaves what was typed in place; a success resets the form. A SubmitButton inside it shows the
 * pending state through context, so server pages can render it with plain children.
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
  children: React.ReactNode;
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
      <ResultFormPending value={pending}>{children}</ResultFormPending>
    </form>
  );
}
