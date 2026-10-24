import { Skeleton } from '@heroui/react';
import { ACTIVITY_RUN_STEP_ROW_CLASS, ACTIVITY_RUN_STORY_SKELETON_STEPS } from './activity-run-story.constants';

/** Placeholder mirroring the run timeline: step rows of the real geometry. */
export function ActivityRunStorySkeleton() {
  return (
    <div className="flex flex-col" data-testid="activity-run-story-skeleton-steps">
      {Array.from({ length: ACTIVITY_RUN_STORY_SKELETON_STEPS }, (_unused, index) => (
        <div className={ACTIVITY_RUN_STEP_ROW_CLASS} key={index}>
          <Skeleton className="h-4 w-24 shrink-0 rounded" />
          <Skeleton className="mt-1.5 size-2.5 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Skeleton className="h-4 w-2/3 rounded" />
            <Skeleton className="h-3 w-1/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
