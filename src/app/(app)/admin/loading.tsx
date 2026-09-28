import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-11 w-28" />
      <div className="flex flex-col gap-0.5 divide-y divide-border rounded-3xl bg-card py-1">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex h-14 items-center px-4">
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
