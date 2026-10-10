"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HealthCard } from "@/components/health-stack";

/** Home: "You're away until 3 Nov · exams", with I'm back. Shown while Away. */
export function AwayHomeCard({
  until,
  reason,
  imBack,
}: {
  /** "3 Nov". */
  until: string;
  reason: string;
  imBack: () => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <HealthCard>
      <div>
        <h3 className="font-heading text-[22px] leading-tight">You&apos;re away</h3>
        <p className="text-sm">
          Until {until} · {reason}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await imBack();
              if (!result.ok) toast.error(result.error);
              else {
                toast.success("Welcome back", { id: "away-saved" });
                router.refresh();
              }
            })
          }
          className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          I&apos;m back
        </button>
        <span className="text-xs">Nobody will chase you until then.</span>
      </div>
    </HealthCard>
  );
}
