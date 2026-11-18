import { EventsOn } from '../../../wailsjs/runtime/runtime';
import type { Notification } from '../../shared/contracts/notification.types';
import {
  NOTIFICATION_ARCHIVED_EVENT_NAME,
  NOTIFICATION_EVENT_NAME,
  NOTIFICATION_NAVIGATE_EVENT_NAME,
  NOTIFICATION_SOURCE_STATE,
} from './notification-source.constants';
import type { NotificationPushSource } from '../../shared/contracts/notification-push.types';
import { createRuntimeSubscription } from '../wails-bindings.helpers';

/**
 * Creates the singleton runtime-backed notification source. Browser contexts
 * degrade to a no-op subscription while still preserving the unsubscribe contract.
 */
export function createNotificationSource(): NotificationPushSource {
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

  // A route is forwarded only when it is a non-empty string. The backend
  // refuses a route-less token rather than emitting one, so neither an absent
  // nor an empty payload can arrive from the intent — but navigating to '' is
  // not a no-op in a router, it resolves against the current route, so the
  // boundary drops what it cannot use instead of moving the user somewhere
  // nobody asked for.
  const navigateSubscription = createRuntimeSubscription<string>((emit) => {
    return EventsOn(NOTIFICATION_NAVIGATE_EVENT_NAME, (payload: unknown) => {
      if (typeof payload === 'string' && payload !== '') {
        emit(payload);
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
    subscribeNavigate(listener) {
      return navigateSubscription.subscribe(listener);
    },
  };

  return NOTIFICATION_SOURCE_STATE.sharedSource;
}
