import { useMemo } from 'react';
import { createNotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.helpers';
import type { NotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.types';
import { useNotificationFilters } from '../NotificationFilterBar/use-notification-filters';
import { toNotificationEmptyStateConditions } from './notification-center-panel.helpers';
import type { NotificationCenterPanelResult } from './notification-center-panel.types';
import { useNotificationCenterSync, type NotificationCenterSyncView } from './use-notification-center-sync';
import { useNotificationSelection } from './use-notification-selection';

/** Fixed archive view until a later slice wires the active/archived toggle onto the panel. */
const PANEL_DEFAULT_VIEW: NotificationCenterSyncView = 'active';
/** Fixed unread-only filter until a later slice wires that toggle onto the panel. */
const PANEL_DEFAULT_UNREAD_ONLY = false;

/**
 * Wires `useNotificationCenterSync`'s master-list page, `useNotificationFilters`'
 * debounced search, and `useNotificationSelection`'s bulk-action state into
 * `NotificationTable` + `NotificationEmptyState` + `NotificationFilterBar` +
 * `NotificationSelectionBar`'s combined props (Slice 3b). The archived/unread
 * view toggles remain a later slice's addition.
 */
export function useNotificationCenterPanel(
  source: NotificationCenterSource = createNotificationCenterSource(),
): NotificationCenterPanelResult {
  // 4. Queries/Mutations
  const { searchInput, debouncedSearch, onSearchInputChange } = useNotificationFilters();
  const { rows, isLoading, hasNextPage, totalEverRecorded, degraded, onLoadMore, refetch } = useNotificationCenterSync({
    source,
    unreadOnly: PANEL_DEFAULT_UNREAD_ONLY,
    view: PANEL_DEFAULT_VIEW,
    search: debouncedSearch,
  });
  const { selectedKeys, selectedCount, onSelectionChange, onMarkRead, onArchive, onClearSelection } = useNotificationSelection({
    source,
    rows,
    onMutated: refetch,
  });

  // 5. Derived State (useMemo)
  const emptyStateConditions = useMemo(
    () =>
      toNotificationEmptyStateConditions({
        totalEverRecorded,
        view: PANEL_DEFAULT_VIEW,
        unreadOnly: PANEL_DEFAULT_UNREAD_ONLY,
        degraded,
        hasSearch: debouncedSearch.trim() !== '',
      }),
    [totalEverRecorded, degraded, debouncedSearch],
  );

  return {
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
  };
}
