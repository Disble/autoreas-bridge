import { Skeleton } from '@heroui/react';
import { ACTIVITY_INCIDENT_LIST_ROW_CLASS, ACTIVITY_INCIDENT_SKELETON_ROWS } from './activity-incidents.constants';

/** Placeholder mirroring the incident list: rows of the real geometry, a dot and two lines each. */
export function ActivityIncidentListSkeleton() {
  return (
    <div className="flex flex-col" data-testid="activity-incident-list-skeleton">
      {Array.from({ length: ACTIVITY_INCIDENT_SKELETON_ROWS }, (_unused, index) => (
        <div className={`${ACTIVITY_INCIDENT_LIST_ROW_CLASS} px-3 py-2`} key={index}>
          <Skeleton className="size-2 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Skeleton className="h-4 w-3/4 rounded" />
            <Skeleton className="h-3 w-1/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
