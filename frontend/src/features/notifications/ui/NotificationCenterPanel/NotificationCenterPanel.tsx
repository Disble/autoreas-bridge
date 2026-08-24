import { NotificationEmptyState } from '../NotificationEmptyState/NotificationEmptyState';
import { NotificationTable } from '../NotificationTable/NotificationTable';
import type { NotificationCenterPanelProps } from './notification-center-panel.types';
import { useNotificationCenterPanel } from './use-notification-center-panel';

/**
 * NotificationCenterPanel composes the notification master list: the dense
 * table, its empty-state renderings, and the keyset-cursor pagination hook
 * behind them. Selection, search, and filters are Slice 3b's addition.
 */
export function NotificationCenterPanel({ source }: Readonly<NotificationCenterPanelProps>) {
  const { rows, isLoading, hasNextPage, onLoadMore, emptyStateConditions } = useNotificationCenterPanel(source);

  return (
    <NotificationTable
      hasNextPage={hasNextPage}
      isLoading={isLoading}
      onLoadMore={onLoadMore}
      renderEmptyState={() => <NotificationEmptyState {...emptyStateConditions} />}
      rows={rows}
    />
  );
}
