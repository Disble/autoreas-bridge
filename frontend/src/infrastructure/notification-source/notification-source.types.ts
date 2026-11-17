import type { NotificationPushSource } from '../../shared/contracts/notification-push.types';

/**
 * The notification push port under its adapter-side name, kept for the feature
 * consumers that still import it from here; the contract is
 * `NotificationPushSource` in `shared/contracts/notification-push.types.ts`.
 */
export type NotificationSource = NotificationPushSource;
