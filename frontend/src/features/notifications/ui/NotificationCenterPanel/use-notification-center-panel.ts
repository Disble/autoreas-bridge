import { useCallback, useMemo, useState } from 'react';
import type { UIEvent } from 'react';
import type { NotificationPushSource } from '../../../../shared/contracts/notification-push.types';
import type { NotificationCenterSource } from '../../../../shared/contracts/notification-center.types';
import { isNearListBottom } from '../../../../shared/helpers/progressive-list.helpers';
import { BRIDGE_NOTIFICATION_CENTER_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
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
import { useNotificationKeyboardScope } from './use-notification-keyboard-scope';
import { useNotificationMarkAllRead } from './use-notification-mark-all-read';
import { useNotificationOpenRecord } from './use-notification-open-record';
import { useNotificationSelection } from './use-notification-selection';
import { useNotificationUnreadCount } from './use-notification-unread-count';

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
 * The unread count and the refresh after every lifecycle mutation come from
 * `useNotificationUnreadCount`, which shares the nav rail badge's query key.
 *
 * `pushSource` is forwarded untouched: the sync hook owns its default, so
 * `BRIDGE_NOTIFICATION_PUSH_SOURCE` is named in exactly one place.
 */
export function useNotificationCenterPanel(
  source: NotificationCenterSource = BRIDGE_NOTIFICATION_CENTER_SOURCE,
  pushSource?: NotificationPushSource,
): NotificationCenterPanelResult {
  // 2. State
  const [view, setView] = useState<NotificationCenterView>(PANEL_INITIAL_VIEW);

  // 4. Queries/Mutations
  const { searchInput, debouncedSearch, onSearchInputChange, levels, onLevelsChange, sources, onSourcesChange, hasFacetFilters } =
    useNotificationFilters();
  const query = toNotificationCenterQuery(view);
  const { rows, totalEverRecorded, listState, onLoadMore, refetch, applyReadState } = useNotificationCenterSync({
    source,
    pushSource,
    unreadOnly: query.unreadOnly,
    view: query.view,
    search: debouncedSearch,
    levels,
    sources,
  });
  const { unreadCount, onMutated, onReadStateChanged } = useNotificationUnreadCount({ source, refetchList: refetch, applyReadState });

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
        serviceAvailable: listState !== 'failure',
        hasSearch: debouncedSearch.trim() !== '',
        hasFacetFilters,
      }),
    [totalEverRecorded, view, listState, debouncedSearch, hasFacetFilters],
  );

  // 6. Callbacks

  const sourceOptions = useNotificationSourceOptions(rows);
  const { selectedKeys, selectedCount, onSelectionChange, onMarkRead, onArchive, onRestore, onClearSelection } = useNotificationSelection({
    source,
    rows: visibleRows,
    onMutated,
  });
  const { canMarkAllRead, onMarkAllRead } = useNotificationMarkAllRead({ source, rows: visibleRows, onMutated });
  useNotificationKeyboardScope({ canMarkAllRead, onMarkAllRead });
  const { openRecord, onOpenRecord } = useNotificationOpenRecord({ source, onReadStateChanged });

  const onViewChange = useCallback(
    (next: NotificationCenterView) => {
      setView(next);
      onClearSelection();
    },
    [onClearSelection],
  );

  // The near-bottom gate lives here rather than in `NotificationTable`,
  // because the table is dumb UI (CLAUDE.md frontend constraint #1) and
  // because it is the same gate the Runtime Events and Transactions rails
  // apply -- one trigger mechanism across all three, and the only one that
  // cannot fire without a user gesture.
  const onScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const element = event.currentTarget;

      if (!isNearListBottom(element.scrollTop, element.clientHeight, element.scrollHeight)) {
        return;
      }

      onLoadMore();
    },
    [onLoadMore],
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
    listState,
    rows: visibleRows,
    onScroll,
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
    onReadStateChanged,
  };
}
