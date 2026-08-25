import type { NotificationSource } from '../../../../infrastructure/notification-source/notification-source.types';

/**
 * Props accepted by `NotificationNavigationListener`. `source` is the runtime
 * navigate stream the listener subscribes to; it is optional and defaults, in
 * the hook that finally consumes it, to the runtime-backed singleton — the
 * same injectable-source contract `useBackendEventResolver` already exposes.
 */
export interface NotificationNavigationListenerProps {
  readonly source?: NotificationSource;
}
