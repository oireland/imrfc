import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-11 w-40" />
        <Skeleton className="h-4 w-48" />
      </div>

      <Skeleton className="h-16 w-full rounded-3xl" />
      <Skeleton className="h-40 w-full rounded-3xl" />
      <Skeleton className="h-11 w-full rounded-full" />
    </div>
  );
}
