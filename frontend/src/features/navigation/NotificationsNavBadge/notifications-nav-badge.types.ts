import type { NotificationCenterSource } from '../../../shared/contracts/notification-center.types';

/** Props accepted by `NotificationsNavBadge`. The source defaults to the app's notification-center adapter. */
export interface NotificationsNavBadgeProps {
  readonly centerSource?: NotificationCenterSource;
}
