import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-11 w-36" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-80 w-full rounded-3xl" />
    </div>
  );
}
