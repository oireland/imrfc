import { Skeleton } from "@/components/ui/skeleton";

function GroupSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 px-1">
        <Skeleton className="size-9 shrink-0 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-32 w-full rounded-3xl" />
    </div>
  );
}

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-11 w-24" />
        <Skeleton className="h-4 w-64" />
      </div>

      <GroupSkeleton />
      <GroupSkeleton />
    </div>
  );
}
