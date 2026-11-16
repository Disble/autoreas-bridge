import { Skeleton } from '@heroui/react';
import {
  NOTIFICATION_TABLE_ARIA_LABEL,
  NOTIFICATION_TABLE_LOADING_LABEL,
  NOTIFICATION_TABLE_LOADING_LABEL_ID,
  NOTIFICATION_TABLE_SELECTION_COLUMN_WIDTH,
  NOTIFICATION_TABLE_SKELETON_ROW_COUNT,
  NOTIFICATION_TABLE_SOURCE_COLUMN_WIDTH,
  NOTIFICATION_TABLE_WHEN_COLUMN_WIDTH,
} from './notification-table.constants';

/**
 * The master list while its first page loads: a plain `<table>` in place of the
 * React Aria `Table` (placeholder rows inside a React Aria collection can wedge
 * its focus scan, docs/design/patterns/loading-empty-error.md), keeping the
 * real header's columns and widths, marked `aria-busy`, with a polite status
 * region beside it. Each placeholder row mirrors a real row's title line and
 * its second text line.
 */
export function NotificationTableSkeleton() {
  return (
    <div className="max-h-[32rem] overflow-y-auto [scrollbar-gutter:stable] 2xl:max-h-[40rem]">
      <div aria-labelledby={NOTIFICATION_TABLE_LOADING_LABEL_ID} aria-live="polite" className="sr-only" role="status">
        <span id={NOTIFICATION_TABLE_LOADING_LABEL_ID}>{NOTIFICATION_TABLE_LOADING_LABEL}</span>
      </div>
      <table aria-busy="true" aria-label={NOTIFICATION_TABLE_ARIA_LABEL} className="w-full table-fixed text-sm">
        <thead>
          <tr className="text-left text-xs text-default-500">
            <th className={`${NOTIFICATION_TABLE_SELECTION_COLUMN_WIDTH} px-3 py-2`}>
              <span className="sr-only">Select</span>
            </th>
            <th className="px-3 py-2">
              Title
            </th>
            <th className={`${NOTIFICATION_TABLE_SOURCE_COLUMN_WIDTH} px-3 py-2`}>
              Source
            </th>
            <th className={`${NOTIFICATION_TABLE_WHEN_COLUMN_WIDTH} px-3 py-2`}>
              When
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: NOTIFICATION_TABLE_SKELETON_ROW_COUNT }, (_unused, index) => (
            <tr data-testid="notification-table-skeleton-row" key={index}>
              <td className="px-3 py-2">
                <Skeleton className="size-4 rounded" />
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-col gap-1.5 pl-4">
                  <Skeleton className="h-4 w-3/4 rounded" />
                  <Skeleton className="h-3 w-1/2 rounded" />
                </div>
              </td>
              <td className="px-3 py-2">
                <Skeleton className="h-3 w-16 rounded" />
              </td>
              <td className="px-3 py-2">
                <Skeleton className="h-3 w-12 rounded" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
