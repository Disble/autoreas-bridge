import type { NotificationPushSource } from '../../../../shared/contracts/notification-push.types';

/**
 * Props accepted by `NotificationNavigationListener`. `source` is the runtime
 * navigate stream the listener subscribes to; it is optional and defaults, in
 * the hook that finally consumes it, to `BRIDGE_NOTIFICATION_PUSH_SOURCE` — the
 * same injectable-source contract `useBackendEventResolver` already exposes.
 */
export interface NotificationNavigationListenerProps {
  readonly source?: NotificationPushSource;
}
