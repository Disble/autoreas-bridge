import type { NotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationRow } from '../../../../shared/contracts/notification-center.types';
import type { NotificationEmptyStateConditions } from '../NotificationEmptyState/notification-empty-state.types';
import type { NotificationCenterSyncView } from './use-notification-center-sync';

/** Props accepted by `NotificationCenterPanel`. Defaults to the runtime-backed singleton source. */
export interface NotificationCenterPanelProps {
  readonly source?: NotificationCenterSource;
}

/**
 * Everything `toNotificationEmptyStateConditions` needs to derive the
 * `NotificationEmptyState` condition tuple from the sync hook's page-level
 * fields.
 */
export interface NotificationCenterPanelEmptyStateInput {
  readonly totalEverRecorded: number;
  readonly view: NotificationCenterSyncView;
  readonly unreadOnly: boolean;
  readonly degraded: boolean;
}

/** Everything `NotificationCenterPanel` needs from `useNotificationCenterPanel`. */
export interface NotificationCenterPanelResult {
  readonly rows: readonly NotificationRow[];
  readonly isLoading: boolean;
  readonly hasNextPage: boolean;
  readonly onLoadMore: () => void;
  readonly emptyStateConditions: NotificationEmptyStateConditions;
}
