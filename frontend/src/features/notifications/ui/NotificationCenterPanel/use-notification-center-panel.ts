import { useCallback, useMemo, useState } from 'react';
import { createNotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.helpers';
import type { NotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationSource } from '../../../../infrastructure/notification-source/notification-source.types';
import { useNotificationFilters } from '../NotificationFilterBar/use-notification-filters';
import type { NotificationTableRowAction } from '../NotificationTable/notification-table.types';
import { toNotificationEmptyStateConditions, toNotificationRecordId } from './notification-center-panel.helpers';
import type { NotificationCenterPanelResult } from './notification-center-panel.types';
import { useNotificationCenterSync, type NotificationCenterSyncView } from './use-notification-center-sync';
import { useNotificationOpenRecord } from './use-notification-open-record';
import { useNotificationSelection } from './use-notification-selection';

/** The view the panel opens on: the inbox, not the archive. */
const PANEL_INITIAL_VIEW: NotificationCenterSyncView = 'active';
/** Fixed unread-only filter until a later slice wires that toggle onto the panel. */
const PANEL_DEFAULT_UNREAD_ONLY = false;

/**
 * Wires `useNotificationCenterSync`'s master-list page, `useNotificationFilters`'
 * debounced search, and `useNotificationSelection`'s bulk-action state into
 * `NotificationTable` + `NotificationEmptyState` + `NotificationFilterBar` +
 * `NotificationSelectionBar`'s combined props (Slice 3b), plus
 * `useNotificationOpenRecord`'s open record for the `NotificationDetail`
 * pane beside them. The unread-only view toggle remains a later slice's
 * addition.
 *
 * The active/archived view is owned here as state rather than pinned to a
 * constant. Pinning it made archiving a one-way door: the record left the
 * only reachable view, `RestoreNotifications` had no caller, and the
 * "all archived" empty state told the user to switch to a view no control
 * offered.
 *
 * Switching views clears the selection on purpose. The two views do not
 * offer the same bulk action -- archive belongs to one, restore to the other
 * -- so a row carried across the boundary would sit selected under a button
 * that means something else than it did when it was picked.
 *
 * `pushSource` is forwarded untouched: the sync hook owns its default, so
 * the runtime singleton is named in exactly one place.
 */
export function useNotificationCenterPanel(
  source: NotificationCenterSource = createNotificationCenterSource(),
  pushSource?: NotificationSource,
): NotificationCenterPanelResult {
  // 2. State
  const [view, setView] = useState<NotificationCenterSyncView>(PANEL_INITIAL_VIEW);

  // 4. Queries/Mutations
  const { searchInput, debouncedSearch, onSearchInputChange } = useNotificationFilters();
  const { rows, isLoading, hasNextPage, totalEverRecorded, degraded, onLoadMore, refetch } = useNotificationCenterSync({
    source,
    pushSource,
    unreadOnly: PANEL_DEFAULT_UNREAD_ONLY,
    view,
    search: debouncedSearch,
  });
  const { selectedKeys, selectedCount, onSelectionChange, onMarkRead, onArchive, onRestore, onClearSelection } = useNotificationSelection({
    source,
    rows,
    onMutated: refetch,
  });
  const { openRecord, onOpenRecord } = useNotificationOpenRecord({ source });

  // 5. Derived State (useMemo)
  const emptyStateConditions = useMemo(
    () =>
      toNotificationEmptyStateConditions({
        totalEverRecorded,
        view,
        unreadOnly: PANEL_DEFAULT_UNREAD_ONLY,
        degraded,
        hasSearch: debouncedSearch.trim() !== '',
      }),
    [totalEverRecorded, view, degraded, debouncedSearch],
  );

  // 6. Callbacks
  const onViewChange = useCallback(
    (next: NotificationCenterSyncView) => {
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
  };
}
