import { NotificationDetail } from '../NotificationDetail/NotificationDetail';
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
 * pagination hook behind them all (Slice 3b) -- plus the `NotificationDetail`
 * pane beside the list, which pressing a row opens that record in. `source`
 * is forwarded to the pane as well as to the hook, so a pressed row action
 * executes against the same source the list was read from, and `pushSource`
 * is forwarded so a record arriving while the panel is open appears in the
 * list without a remount.
 */
export function NotificationCenterPanel({ pushSource, source }: Readonly<NotificationCenterPanelProps>) {
  const {
    rows,
    isLoading,
    hasNextPage,
    onLoadMore,
    emptyStateConditions,
    searchInput,
    onSearchInputChange,
    view,
    onViewChange,
    selectedKeys,
    onSelectionChange,
    selectedCount,
    onMarkRead,
    onArchive,
    onRestore,
    onClearSelection,
    openRecord,
    onRowAction,
  } = useNotificationCenterPanel(source, pushSource);

  return (
    <div className="flex flex-col gap-4">
      <NotificationFilterBar onSearchInputChange={onSearchInputChange} onViewChange={onViewChange} searchInput={searchInput} view={view} />
      <NotificationSelectionBar
        onArchive={onArchive}
        onClearSelection={onClearSelection}
        onMarkRead={onMarkRead}
        onRestore={onRestore}
        selectedCount={selectedCount}
        view={view}
      />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <NotificationTable
          hasNextPage={hasNextPage}
          isLoading={isLoading}
          onLoadMore={onLoadMore}
          onRowAction={onRowAction}
          onSelectionChange={onSelectionChange}
          renderEmptyState={() => <NotificationEmptyState {...emptyStateConditions} />}
          rows={rows}
          selectedKeys={selectedKeys}
        />
        <NotificationDetail detail={openRecord} source={source} />
      </div>
    </div>
  );
}
