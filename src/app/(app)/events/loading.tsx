import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3">
        <Skeleton className="h-11 w-32" />
        <Skeleton className="h-4 w-20" />
      </div>

      <div className="flex flex-col gap-3">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-9 w-full rounded-full" />
        <Skeleton className="h-72 w-full rounded-3xl" />
      </div>

      <Skeleton className="h-11 w-full rounded-full" />
    </div>
  );
}
