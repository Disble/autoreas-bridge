import { Skeleton } from '@heroui/react';
import { ACTIVITY_FEED_ROW_CLASS, ACTIVITY_FEED_SKELETON_ROWS } from '../../feed/activity-feed.constants';
import type { ActivityFeedSkeletonProps } from './activity-feed-view.types';

/** Placeholder rows sharing a feed row's geometry, in a polite status region. */
export function ActivityFeedSkeleton({ labelId, label }: ActivityFeedSkeletonProps) {
  return (
    <div aria-labelledby={labelId} aria-live="polite" className="flex flex-col" role="status">
      <span className="sr-only" id={labelId}>
        {label}
      </span>
      {Array.from({ length: ACTIVITY_FEED_SKELETON_ROWS }, (_unused, index) => (
        <div className={ACTIVITY_FEED_ROW_CLASS} data-testid="activity-feed-skeleton-row" key={index}>
          <Skeleton className="h-4 w-12 shrink-0 rounded" />
          <Skeleton className="size-7 shrink-0 rounded-md" />
          <Skeleton className="h-4 min-w-0 flex-1 rounded" />
        </div>
      ))}
    </div>
  );
}
