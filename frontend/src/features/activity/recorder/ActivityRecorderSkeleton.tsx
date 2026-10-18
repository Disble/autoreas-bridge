import { Skeleton } from '@heroui/react';
import { ACTIVITY_RECORDER_ROW_CLASS, ACTIVITY_RECORDER_SKELETON_ROWS } from './activity-recorder.constants';

/** Placeholder mirroring the recorder rows while the first page is unresolved; it shares their geometry. */
export function ActivityRecorderSkeleton() {
  return (
    <div className="flex flex-col divide-y divide-separator">
      {Array.from({ length: ACTIVITY_RECORDER_SKELETON_ROWS }, (_unused, index) => (
        <div className={ACTIVITY_RECORDER_ROW_CLASS} data-testid="activity-recorder-skeleton-row" key={index}>
          <Skeleton className="h-4 w-16 shrink-0 rounded" />
          <Skeleton className="h-4 min-w-0 flex-1 rounded" />
          <Skeleton className="h-5 w-12 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}
