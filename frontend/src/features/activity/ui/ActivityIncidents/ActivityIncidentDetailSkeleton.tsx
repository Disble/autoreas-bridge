import { Skeleton } from '@heroui/react';
import { ACTIVITY_LANE_LABELS, ACTIVITY_LANE_ROW_CLASS, ACTIVITY_REQUEST_SKELETON_ROWS } from './activity-incidents.constants';

/**
 * Placeholder mirroring the incident detail: the header and its chips, the
 * cause block, the three lanes at their real height, and request rows. The
 * request rows are plain blocks, never rows inside the React Aria table.
 */
export function ActivityIncidentDetailSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-2/3 rounded" />
        <Skeleton className="h-4 w-1/3 rounded" />
      </div>
      <Skeleton className="h-16 w-full rounded-lg" />
      <div className="flex flex-col gap-1" data-testid="activity-incident-skeleton-lanes">
        {ACTIVITY_LANE_LABELS.map((lane) => (
          <div className="flex min-w-0 items-center gap-3" key={lane}>
            <Skeleton className="h-3 w-16 shrink-0 rounded" />
            <div className={ACTIVITY_LANE_ROW_CLASS}>
              <Skeleton className="absolute inset-x-0 top-1/2 h-px" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2" data-testid="activity-incident-skeleton-requests">
        {Array.from({ length: ACTIVITY_REQUEST_SKELETON_ROWS }, (_unused, index) => (
          <Skeleton className="h-8 w-full rounded" key={index} />
        ))}
      </div>
    </div>
  );
}
