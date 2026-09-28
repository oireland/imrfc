import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-9">
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-3">
          <Skeleton className="h-11 w-48" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="size-10 shrink-0 rounded-full" />
      </header>

      <section className="flex flex-col gap-3">
        <Skeleton className="h-7 w-32" />
        <div className="grid grid-cols-2 gap-2.5">
          <Skeleton className="h-32 rounded-[20px]" />
          <Skeleton className="h-32 rounded-[20px]" />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-9 w-full rounded-full" />
        <Skeleton className="h-72 w-full rounded-3xl" />
      </section>
    </div>
  );
}
