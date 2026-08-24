import type { NotificationCenterSource } from '../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationSource } from '../../../infrastructure/notification-source/notification-source.types';

/** Props accepted by `NotificationsNavBadge`. Both sources default to the runtime-backed singletons. */
export interface NotificationsNavBadgeProps {
  readonly centerSource?: NotificationCenterSource;
  readonly pushSource?: NotificationSource;
}
