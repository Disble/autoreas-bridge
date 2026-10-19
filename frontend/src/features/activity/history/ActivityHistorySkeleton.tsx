import { Card, Skeleton } from '@heroui/react';
import {
  ACTIVITY_CALENDAR_CELL_CLASS,
  ACTIVITY_CALENDAR_DAYS,
  ACTIVITY_CALENDAR_GRID_CLASS,
  ACTIVITY_HISTORY_ROW_CLASS,
  ACTIVITY_HISTORY_SKELETON_ROWS,
} from './activity-history.constants';

/**
 * Placeholder mirroring History while its first page is unresolved: the
 * calendar grid, a day heading and its lines, sharing their geometry.
 */
export function ActivityHistorySkeleton() {
  return (
    <Card>
      <Card.Content className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24 rounded" />
          <div className={ACTIVITY_CALENDAR_GRID_CLASS} data-testid="activity-history-skeleton-calendar">
            {Array.from({ length: ACTIVITY_CALENDAR_DAYS }, (_unused, index) => (
              <Skeleton className={ACTIVITY_CALENDAR_CELL_CLASS} key={index} />
            ))}
          </div>
        </div>
        <div className="flex flex-col">
          <Skeleton className="h-4 w-28 rounded" />
          {Array.from({ length: ACTIVITY_HISTORY_SKELETON_ROWS }, (_unused, index) => (
            <div className={ACTIVITY_HISTORY_ROW_CLASS} data-testid="activity-history-skeleton-row" key={index}>
              <Skeleton className="h-4 w-12 shrink-0 rounded" />
              <Skeleton className="h-4 min-w-0 flex-1 rounded" />
            </div>
          ))}
        </div>
      </Card.Content>
    </Card>
  );
}
