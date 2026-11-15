import type { UIEvent } from 'react';
import type { NotificationSource } from '../../../../infrastructure/notification-source/notification-source.types';
import type {
  NotificationCenterSource,
  NotificationDetail as NotificationDetailDTO,
  NotificationRow,
} from '../../../../shared/contracts/notification-center.types';
import type { NotificationEmptyStateConditions } from '../NotificationEmptyState/notification-empty-state.types';
import type { NotificationFilterOption } from '../NotificationFilterBar/notification-filter-bar.types';
import type { NotificationTableRowAction, NotificationTableSelection } from '../NotificationTable/notification-table.types';
import type { NotificationListState } from './use-notification-center-page';
import type { NotificationCenterSyncView } from './use-notification-center-sync';

/**
 * The four master-list views the Main artboard's tab strip offers. Only two
 * of them are archive views; `unread` and `read` are read-state cuts of the
 * active one, which is why they collapse onto a `NotificationCenterQuery`
 * before a request is built.
 */
export type NotificationCenterView = 'active' | 'unread' | 'read' | 'archived';

/** The archive/read-state pair one `NotificationCenterView` resolves into for the backend query. */
export interface NotificationCenterQuery {
  readonly view: NotificationCenterSyncView;
  readonly unreadOnly: boolean;
}

/** Props accepted by `NotificationCenterPanel`. Both sources default to the app's runtime-backed adapters. */
export interface NotificationCenterPanelProps {
  readonly source?: NotificationCenterSource;
  /** Runtime stream of `notification.archived` events the master list follows. */
  readonly pushSource?: NotificationSource;
}

/**
 * Everything `toNotificationEmptyStateConditions` needs to derive the
 * `NotificationEmptyState` condition tuple from the sync hook's page-level
 * fields plus the filter bar's current narrowing.
 */
export interface NotificationCenterPanelEmptyStateInput {
  readonly totalEverRecorded: number;
  readonly view: NotificationCenterView;
  /** False once the first page failed with nothing to show: the `unavailable` rendering. */
  readonly serviceAvailable: boolean;
  /** Whether a non-empty (trimmed) search is currently applied. */
  readonly hasSearch: boolean;
  /** Whether the level or source dropdown currently narrows the query. */
  readonly hasFacetFilters: boolean;
}

/** Everything `NotificationCenterPanel` needs from `useNotificationCenterPanel`. */
export interface NotificationCenterPanelResult {
  /** Whether the master list's first page is loading (skeleton), failed with nothing to show, or ready. */
  readonly listState: NotificationListState;
  readonly rows: readonly NotificationRow[];
  /**
   * The master list's only load-more trigger: a scroll on the table's own
   * scroll container, gated on `isNearListBottom`. It replaces the
   * `hasNextPage`/`onLoadMore` pair the removed `Table.LoadMore` sentinel
   * needed -- see `NotificationTable` for why that sentinel fed itself.
   */
  readonly onScroll: (event: UIEvent<HTMLDivElement>) => void;
  readonly emptyStateConditions: NotificationEmptyStateConditions;
  readonly searchInput: string;
  readonly onSearchInputChange: (value: string) => void;
  /** Which of the four views the list is currently showing. */
  readonly view: NotificationCenterView;
  /** Switches the list to the given view, clearing the selection with it. */
  readonly onViewChange: (view: NotificationCenterView) => void;
  /**
   * Which of the two archive views the current tab resolves to. The selection
   * bar picks Archive vs Restore from it: the unread and read tabs are cuts
   * of the active list, so both still offer Archive.
   */
  readonly archiveView: NotificationCenterSyncView;
  /** Levels the list is narrowed to; empty means every level. */
  readonly levels: readonly string[];
  /** Replaces the level filter with the set the user just picked. */
  readonly onLevelsChange: (levels: readonly string[]) => void;
  /** Sources the list is narrowed to; empty means every source. */
  readonly sources: readonly string[];
  /** Replaces the source filter with the set the user just picked. */
  readonly onSourcesChange: (sources: readonly string[]) => void;
  /** The sources the dropdown offers, accumulated from the records actually loaded. */
  readonly sourceOptions: readonly NotificationFilterOption[];
  readonly selectedKeys: NotificationTableSelection;
  readonly onSelectionChange: (keys: NotificationTableSelection) => void;
  readonly selectedCount: number;
  readonly onMarkRead: () => void;
  readonly onArchive: () => void;
  /** Un-archives every selected row -- what the selection bar offers in place of `onArchive` while the archived view is showing. */
  readonly onRestore: () => void;
  readonly onClearSelection: () => void;
  /** How many records are unread, from the query the rail badge also reads; 0 until it has loaded. */
  readonly unreadCount: number;
  /** Marks every unread record the list currently holds as read. */
  readonly onMarkAllRead: () => void;
  /** Whether the list currently holds anything unread to mark. */
  readonly canMarkAllRead: boolean;
  /** The record currently open in the detail pane, or `null` while none is. */
  readonly openRecord: NotificationDetailDTO | null;
  /** Opens the pressed master-list row in the detail pane. */
  readonly onRowAction: NotificationTableRowAction;
  /**
   * Handed to the detail pane so a read-state verb pressed there lands on the
   * master-list row beside it, in place and without re-fetching a page, and
   * the unread count is read again.
   */
  readonly onReadStateChanged: (recordIds: readonly number[], isRead: boolean) => void;
}

/** What `useNotificationUnreadCount` needs from the panel: the source and the list it refreshes. */
export interface NotificationUnreadCountInput {
  /** The notification center the count is read from. */
  readonly source: NotificationCenterSource;
  /** Reloads the master list from its first page. */
  readonly refetchList: () => void;
  /** Applies a read-state change to the rows the list already holds. */
  readonly applyReadState: (recordIds: readonly number[], isRead: boolean) => void;
}

/** The unread count the panel shows and the two refresh paths that keep it current. */
export interface NotificationUnreadCountResult {
  /** The count to show; 0 while it loads or after it failed. */
  readonly unreadCount: number;
  /** Refreshes the list and the count after a lifecycle mutation. */
  readonly onMutated: () => void;
  /** Applies a read-state change to the rows and refreshes the count. */
  readonly onReadStateChanged: (recordIds: readonly number[], isRead: boolean) => void;
}
