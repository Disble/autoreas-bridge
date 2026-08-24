import { NotificationCenterHeader } from '../NotificationCenterHeader/NotificationCenterHeader';
import { NotificationDetail } from '../NotificationDetail/NotificationDetail';
import { NotificationEmptyState } from '../NotificationEmptyState/NotificationEmptyState';
import { NotificationFilterBar } from '../NotificationFilterBar/NotificationFilterBar';
import { NotificationSelectionBar } from '../NotificationSelectionBar/NotificationSelectionBar';
import { NotificationTable } from '../NotificationTable/NotificationTable';
import type { NotificationCenterPanelProps } from './notification-center-panel.types';
import { useNotificationCenterPanel } from './use-notification-center-panel';

/**
 * NotificationCenterPanel composes the whole notification screen as the Main
 * artboard lays it out: the page header (title, live unread count, "Mark all
 * as read"), the filter bar (four view tabs, search, level and source
 * dropdowns), the bulk-action selection bar, the dense table with its
 * empty-state renderings and keyset-cursor pagination, and the
 * `NotificationDetail` pane beside the list that pressing a row opens.
 *
 * The header lives here rather than in the route because "Mark all as read"
 * has to reach the very rows the table is showing and refetch them
 * afterwards, which a header mounted outside the panel could not do
 * (`app/**` is composition-only, CLAUDE.md frontend constraint #4).
 *
 * `source` is forwarded to the pane as well as to the hook, so a pressed row
 * action executes against the same source the list was read from, and
 * `pushSource` is forwarded so a record arriving while the panel is open
 * appears in the list without a remount.
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
    archiveView,
    levels,
    onLevelsChange,
    sources,
    onSourcesChange,
    sourceOptions,
    selectedKeys,
    onSelectionChange,
    selectedCount,
    onMarkRead,
    onArchive,
    onRestore,
    onClearSelection,
    unreadCount,
    onMarkAllRead,
    canMarkAllRead,
    openRecord,
    onRowAction,
  } = useNotificationCenterPanel(source, pushSource);

  return (
    <div className="flex flex-col gap-4">
      <NotificationCenterHeader canMarkAllRead={canMarkAllRead} onMarkAllRead={onMarkAllRead} unreadCount={unreadCount} />
      <NotificationFilterBar
        levels={levels}
        onLevelsChange={onLevelsChange}
        onSearchInputChange={onSearchInputChange}
        onSourcesChange={onSourcesChange}
        onViewChange={onViewChange}
        searchInput={searchInput}
        sourceOptions={sourceOptions}
        sources={sources}
        view={view}
      />
      <NotificationSelectionBar
        onArchive={onArchive}
        onClearSelection={onClearSelection}
        onMarkRead={onMarkRead}
        onRestore={onRestore}
        selectedCount={selectedCount}
        view={archiveView}
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
