import { NotificationEmptyState } from '../NotificationEmptyState/NotificationEmptyState';
import { NotificationFilterBar } from '../NotificationFilterBar/NotificationFilterBar';
import { NotificationSelectionBar } from '../NotificationSelectionBar/NotificationSelectionBar';
import { NotificationTable } from '../NotificationTable/NotificationTable';
import type { NotificationCenterPanelProps } from './notification-center-panel.types';
import { useNotificationCenterPanel } from './use-notification-center-panel';

/**
 * NotificationCenterPanel composes the notification master list: the search
 * filter bar, the bulk-action selection bar, the dense table (with
 * multi-select wired in), its empty-state renderings, and the keyset-cursor
 * pagination hook behind them all (Slice 3b).
 */
export function NotificationCenterPanel({ source }: Readonly<NotificationCenterPanelProps>) {
  const {
    rows,
    isLoading,
    hasNextPage,
    onLoadMore,
    emptyStateConditions,
    searchInput,
    onSearchInputChange,
    selectedKeys,
    onSelectionChange,
    selectedCount,
    onMarkRead,
    onArchive,
    onClearSelection,
  } = useNotificationCenterPanel(source);

  return (
    <div className="flex flex-col gap-4">
      <NotificationFilterBar onSearchInputChange={onSearchInputChange} searchInput={searchInput} />
      <NotificationSelectionBar
        onArchive={onArchive}
        onClearSelection={onClearSelection}
        onMarkRead={onMarkRead}
        selectedCount={selectedCount}
      />
      <NotificationTable
        hasNextPage={hasNextPage}
        isLoading={isLoading}
        onLoadMore={onLoadMore}
        onSelectionChange={onSelectionChange}
        renderEmptyState={() => <NotificationEmptyState {...emptyStateConditions} />}
        rows={rows}
        selectedKeys={selectedKeys}
      />
    </div>
  );
}
