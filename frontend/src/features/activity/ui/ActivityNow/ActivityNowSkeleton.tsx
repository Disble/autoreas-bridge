import { Card, Skeleton } from '@heroui/react';
import {
  ACTIVITY_HOUR_CHART_CLASS,
  ACTIVITY_HOURS_IN_CHART,
  ACTIVITY_NOW_FIGURE_COUNT,
  ACTIVITY_NOW_LIST_ROW_CLASS,
  ACTIVITY_NOW_SKELETON_LIST_ROWS,
} from './activity-now.constants';

/**
 * Placeholder mirroring the Now layout while its first read is unresolved:
 * the status card with its three figures and the chart, then the two lists.
 * It shares the chart height and the list row geometry with the real content.
 */
export function ActivityNowSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <Card.Content className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-6 w-2/5 rounded" />
              <Skeleton className="h-4 w-1/3 rounded" />
            </div>
            <div className="flex gap-6" data-testid="activity-now-skeleton-figures">
              {Array.from({ length: ACTIVITY_NOW_FIGURE_COUNT }, (_unused, index) => (
                <Skeleton className="h-11 w-20 rounded" key={index} />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24 rounded" />
            <div className={ACTIVITY_HOUR_CHART_CLASS} data-testid="activity-now-skeleton-chart">
              {Array.from({ length: ACTIVITY_HOURS_IN_CHART }, (_unused, index) => (
                <Skeleton className="h-1/2 min-w-0 flex-1 rounded-sm" key={index} />
              ))}
            </div>
          </div>
        </Card.Content>
      </Card>
      <Card>
        <Card.Content className="grid gap-6 md:grid-cols-2">
          {['needs-a-look', 'recent-changes'].map((list) => (
            <div className="flex flex-col gap-2" data-testid="activity-now-skeleton-list" key={list}>
              <Skeleton className="h-5 w-32 rounded" />
              {Array.from({ length: ACTIVITY_NOW_SKELETON_LIST_ROWS }, (_unused, index) => (
                <div className={ACTIVITY_NOW_LIST_ROW_CLASS} key={index}>
                  <Skeleton className="h-4 w-full rounded" />
                </div>
              ))}
            </div>
          ))}
        </Card.Content>
      </Card>
    </div>
  );
}
