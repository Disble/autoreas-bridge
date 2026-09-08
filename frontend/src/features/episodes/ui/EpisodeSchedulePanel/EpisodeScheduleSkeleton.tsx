import { Card, Skeleton } from '@heroui/react';
import { EPISODE_COVER_SLOT_CLASS, EPISODES_SKELETON_ROW_COUNT } from './episode-schedule-panel.constants';

/**
 * Placeholder rows shown while Today's schedule request is unresolved.
 * Mirrors `EpisodeScheduleCard`'s shape — cover slot, title and chip bars,
 * and a row of action-affordance bars — sharing its `min-h-24` geometry so
 * the schedule does not jump once the real rows arrive.
 */
export function EpisodeScheduleSkeleton() {
  return (
    <>
      {Array.from({ length: EPISODES_SKELETON_ROW_COUNT }, (_unused, index) => (
        <Card className="overflow-hidden" data-testid="episode-schedule-skeleton-row" key={index}>
          <div className="flex min-h-24 gap-4">
            <div className={EPISODE_COVER_SLOT_CLASS}>
              <Skeleton className="absolute inset-0 size-full rounded-none" />
            </div>
            <Card.Content className="grid min-w-0 flex-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0 space-y-2">
                <div className="flex min-w-0 flex-nowrap items-center gap-2">
                  <Skeleton className="h-4 w-2/5 rounded" />
                  <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
                </div>
                <Skeleton className="h-3 w-1/4 rounded" />
              </div>
              <div className="flex shrink-0 flex-nowrap items-center gap-2 sm:justify-end">
                <Skeleton className="size-8 rounded-lg" />
                <Skeleton className="size-8 rounded-lg" />
                <Skeleton className="size-8 rounded-lg" />
              </div>
            </Card.Content>
          </div>
        </Card>
      ))}
    </>
  );
}
