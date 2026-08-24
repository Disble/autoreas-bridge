import { EventsOn } from '../../../wailsjs/runtime/runtime';
import type { Notification } from '../../shared/contracts/notification.types';
import {
  NOTIFICATION_ARCHIVED_EVENT_NAME,
  NOTIFICATION_EVENT_NAME,
  NOTIFICATION_SOURCE_STATE,
} from './notification-source.constants';
import type { NotificationSource } from './notification-source.types';
import { createRuntimeSubscription } from '../wails-bindings.helpers';

/**
 * Creates the singleton runtime-backed notification source. Browser contexts
 * degrade to a no-op subscription while still preserving the unsubscribe contract.
 */
export function createNotificationSource(): NotificationSource {
  if (NOTIFICATION_SOURCE_STATE.sharedSource !== null) {
    return NOTIFICATION_SOURCE_STATE.sharedSource;
  }

  const notificationSubscription = createRuntimeSubscription<Notification>((emit) => {
    return EventsOn(NOTIFICATION_EVENT_NAME, (payload: unknown) => {
      if (payload !== undefined) {
        emit(payload as Notification);
      }
    });
  });

  const archivedSubscription = createRuntimeSubscription<readonly number[]>((emit) => {
    return EventsOn(NOTIFICATION_ARCHIVED_EVENT_NAME, (payload: unknown) => {
      if (Array.isArray(payload)) {
        emit(payload as readonly number[]);
      }
    });
  });

  NOTIFICATION_SOURCE_STATE.sharedSource = {
    subscribe(listener) {
      return notificationSubscription.subscribe(listener);
    },
    subscribeArchived(listener) {
      return archivedSubscription.subscribe(listener);
    },
  };

  return NOTIFICATION_SOURCE_STATE.sharedSource;
}

/**
 * Shared notification source singleton used by the app shell.
 *
 * All nine infrastructure source modules export their singleton from their
 * own `.helpers` file, so relocating just this one would diverge from every
 * sibling. It cannot move to `.constants.ts` either: that file holds the
 * state container this one imports, so the move would introduce a cycle.
 * The rule stays on for genuinely new violations; this one is suppressed in
 * place so the debt is visible rather than silently disabled repo-wide.
 */
export const notificationSource = createNotificationSource(); // eslint-disable-line dharness/role-file-shape
