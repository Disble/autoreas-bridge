import { Skeleton } from '@heroui/react';

/** The drawer body while its reads load: a figures block and two fact sections. */
export function ActivityDrawerSkeleton() {
  return (
    <div className="flex flex-col gap-5" data-testid="activity-drawer-skeleton">
      <Skeleton className="h-20 w-full rounded-lg" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-24 rounded" />
        <Skeleton className="h-5 w-full rounded" />
        <Skeleton className="h-5 w-full rounded" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-32 rounded" />
        <Skeleton className="h-5 w-full rounded" />
      </div>
    </div>
  );
}
