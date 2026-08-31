import type { UIEvent } from 'react';
import type { NotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationSource } from '../../../../infrastructure/notification-source/notification-source.types';
import type { NotificationDetail as NotificationDetailDTO, NotificationRow } from '../../../../shared/contracts/notification-center.types';
import type { NotificationEmptyStateConditions } from '../NotificationEmptyState/notification-empty-state.types';
import type { NotificationFilterOption } from '../NotificationFilterBar/notification-filter-bar.types';
import type { NotificationTableRowAction, NotificationTableSelection } from '../NotificationTable/notification-table.types';
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

/** Props accepted by `NotificationCenterPanel`. Both sources default to the runtime-backed singletons. */
export interface NotificationCenterPanelProps {
  readonly source?: NotificationCenterSource;
  /** Runtime push stream the master list live-refreshes from, the same one the rail badge listens to. */
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
  readonly degraded: boolean;
  /** Whether a non-empty (trimmed) search is currently applied. */
  readonly hasSearch: boolean;
  /** Whether the level or source dropdown currently narrows the query. */
  readonly hasFacetFilters: boolean;
}

/** Everything `NotificationCenterPanel` needs from `useNotificationCenterPanel`. */
export interface NotificationCenterPanelResult {
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
  /** How many records are unread, as the shared notification store last reported -- the value the rail badge also renders. */
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
   * master-list row beside it, in place and without re-fetching a page.
   */
  readonly onReadStateChanged: (recordIds: readonly number[], isRead: boolean) => void;
}
