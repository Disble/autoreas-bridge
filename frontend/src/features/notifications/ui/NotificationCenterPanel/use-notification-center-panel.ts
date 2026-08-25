import { useCallback, useMemo, useState } from 'react';
import { createNotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.helpers';
import type { NotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationSource } from '../../../../infrastructure/notification-source/notification-source.types';
import { useNotificationStore } from '../../../../shared/store/notification-store/use-notification-store';
import { useNotificationFilters } from '../NotificationFilterBar/use-notification-filters';
import { useNotificationSourceOptions } from '../NotificationFilterBar/use-notification-source-options';
import type { NotificationTableRowAction } from '../NotificationTable/notification-table.types';
import {
  filterNotificationRowsForView,
  toNotificationCenterQuery,
  toNotificationEmptyStateConditions,
  toNotificationRecordId,
} from './notification-center-panel.helpers';
import type { NotificationCenterPanelResult, NotificationCenterView } from './notification-center-panel.types';
import { useNotificationCenterSync } from './use-notification-center-sync';
import { useNotificationMarkAllRead } from './use-notification-mark-all-read';
import { useNotificationOpenRecord } from './use-notification-open-record';
import { useNotificationSelection } from './use-notification-selection';

/** The view the panel opens on: the inbox, not the archive and not a read-state cut of it. */
const PANEL_INITIAL_VIEW: NotificationCenterView = 'active';

/**
 * Wires `useNotificationCenterSync`'s master-list page, `useNotificationFilters`'
 * debounced search and facet filters, and `useNotificationSelection`'s
 * bulk-action state into `NotificationTable` + `NotificationEmptyState` +
 * `NotificationCenterHeader` + `NotificationFilterBar` +
 * `NotificationSelectionBar`'s combined props, plus
 * `useNotificationOpenRecord`'s open record for the `NotificationDetail`
 * pane beside them.
 *
 * The view is owned here as state rather than pinned to a constant. Pinning
 * it made archiving a one-way door: the record left the only reachable view,
 * `RestoreNotifications` had no caller, and the "all archived" empty state
 * told the user to switch to a view no control offered.
 *
 * Switching views clears the selection on purpose. The views do not offer the
 * same bulk action -- archive belongs to the active ones, restore to the
 * archive -- so a row carried across the boundary would sit selected under a
 * button that means something else than it did when it was picked.
 *
 * The unread count is READ from the shared notification store rather than
 * fetched: the nav rail badge already seeds it and every lifecycle mutation
 * already feeds it, so a second read here could only introduce a way for the
 * header and the badge to disagree.
 *
 * `pushSource` is forwarded untouched: the sync hook owns its default, so
 * the runtime singleton is named in exactly one place.
 */
export function useNotificationCenterPanel(
  source: NotificationCenterSource = createNotificationCenterSource(),
  pushSource?: NotificationSource,
): NotificationCenterPanelResult {
  // 2. State
  const [view, setView] = useState<NotificationCenterView>(PANEL_INITIAL_VIEW);

  // 3. Context/3rd Party Hooks
  const unreadCount = useNotificationStore((state) => state.unreadCount);

  // 4. Queries/Mutations
  const { searchInput, debouncedSearch, onSearchInputChange, levels, onLevelsChange, sources, onSourcesChange, hasFacetFilters } =
    useNotificationFilters();
  const query = toNotificationCenterQuery(view);
  const { rows, isLoading, hasNextPage, totalEverRecorded, degraded, onLoadMore, refetch, applyReadState } = useNotificationCenterSync({
    source,
    pushSource,
    unreadOnly: query.unreadOnly,
    view: query.view,
    search: debouncedSearch,
    levels,
    sources,
  });

  // 5. Derived State (useMemo)
  // The read view is narrowed here rather than in the query, because the
  // store exposes no read-only filter to narrow it with -- see
  // `toNotificationCenterQuery`. Everything downstream (selection, bulk
  // actions, mark-all-read) reads these rows, so a row the user cannot see is
  // never one an action can reach.
  const visibleRows = useMemo(() => filterNotificationRowsForView(rows, view), [rows, view]);
  const emptyStateConditions = useMemo(
    () =>
      toNotificationEmptyStateConditions({
        totalEverRecorded,
        view,
        degraded,
        hasSearch: debouncedSearch.trim() !== '',
        hasFacetFilters,
      }),
    [totalEverRecorded, view, degraded, debouncedSearch, hasFacetFilters],
  );

  const sourceOptions = useNotificationSourceOptions(rows);
  const { selectedKeys, selectedCount, onSelectionChange, onMarkRead, onArchive, onRestore, onClearSelection } = useNotificationSelection({
    source,
    rows: visibleRows,
    onMutated: refetch,
  });
  const { canMarkAllRead, onMarkAllRead } = useNotificationMarkAllRead({ source, rows: visibleRows, onMutated: refetch });
  const { openRecord, onOpenRecord } = useNotificationOpenRecord({ source, onReadStateChanged: applyReadState });

  // 6. Callbacks
  const onViewChange = useCallback(
    (next: NotificationCenterView) => {
      setView(next);
      onClearSelection();
    },
    [onClearSelection],
  );

  const onRowAction = useCallback<NotificationTableRowAction>(
    (key) => {
      const id = toNotificationRecordId(key);
      if (id === null) {
        return;
      }
      onOpenRecord(id);
    },
    [onOpenRecord],
  );

  return {
    rows: visibleRows,
    isLoading,
    hasNextPage,
    onLoadMore,
    emptyStateConditions,
    searchInput,
    onSearchInputChange,
    view,
    onViewChange,
    archiveView: query.view,
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
    onReadStateChanged: applyReadState,
  };
}
