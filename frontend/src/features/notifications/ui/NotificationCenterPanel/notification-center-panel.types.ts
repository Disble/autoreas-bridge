import type { NotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationSource } from '../../../../infrastructure/notification-source/notification-source.types';
import type { NotificationDetail as NotificationDetailDTO, NotificationRow } from '../../../../shared/contracts/notification-center.types';
import type { NotificationEmptyStateConditions } from '../NotificationEmptyState/notification-empty-state.types';
import type { NotificationTableRowAction, NotificationTableSelection } from '../NotificationTable/notification-table.types';
import type { NotificationCenterSyncView } from './use-notification-center-sync';

/** Props accepted by `NotificationCenterPanel`. Both sources default to the runtime-backed singletons. */
export interface NotificationCenterPanelProps {
  readonly source?: NotificationCenterSource;
  /** Runtime push stream the master list live-refreshes from, the same one the rail badge listens to. */
  readonly pushSource?: NotificationSource;
}

/**
 * Everything `toNotificationEmptyStateConditions` needs to derive the
 * `NotificationEmptyState` condition tuple from the sync hook's page-level
 * fields plus the filter bar's debounced search (Slice 3b).
 */
export interface NotificationCenterPanelEmptyStateInput {
  readonly totalEverRecorded: number;
  readonly view: NotificationCenterSyncView;
  readonly unreadOnly: boolean;
  readonly degraded: boolean;
  /** Whether a non-empty (trimmed) search is currently applied -- the only filter this slice wires. */
  readonly hasSearch: boolean;
}

/** Everything `NotificationCenterPanel` needs from `useNotificationCenterPanel`. */
export interface NotificationCenterPanelResult {
  readonly rows: readonly NotificationRow[];
  readonly isLoading: boolean;
  readonly hasNextPage: boolean;
  readonly onLoadMore: () => void;
  readonly emptyStateConditions: NotificationEmptyStateConditions;
  readonly searchInput: string;
  readonly onSearchInputChange: (value: string) => void;
  /** Which archive view the list is currently showing. */
  readonly view: NotificationCenterSyncView;
  /** Switches the list to the given view, clearing the selection with it. */
  readonly onViewChange: (view: NotificationCenterSyncView) => void;
  readonly selectedKeys: NotificationTableSelection;
  readonly onSelectionChange: (keys: NotificationTableSelection) => void;
  readonly selectedCount: number;
  readonly onMarkRead: () => void;
  readonly onArchive: () => void;
  /** Un-archives every selected row -- what the selection bar offers in place of `onArchive` while the archived view is showing. */
  readonly onRestore: () => void;
  readonly onClearSelection: () => void;
  /** The record currently open in the detail pane, or `null` while none is. */
  readonly openRecord: NotificationDetailDTO | null;
  /** Opens the pressed master-list row in the detail pane. */
  readonly onRowAction: NotificationTableRowAction;
}
