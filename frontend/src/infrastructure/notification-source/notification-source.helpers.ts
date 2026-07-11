import { EventsOn } from '../../../wailsjs/runtime/runtime';
import type { Notification } from '../../shared/contracts/notification.types';
import { NOTIFICATION_EVENT_NAME, NOTIFICATION_SOURCE_STATE } from './notification-source.constants';
import type { NotificationSource } from './notification-source.types';
import { hasRuntimeBindings, waitForBindings } from '../wails-bindings.helpers';

/**
 * Creates the singleton runtime-backed notification source. Browser contexts
 * degrade to a no-op subscription while still preserving the unsubscribe contract.
 */
export function createNotificationSource(): NotificationSource {
  if (NOTIFICATION_SOURCE_STATE.sharedSource !== null) {
    return NOTIFICATION_SOURCE_STATE.sharedSource;
  }

  const listeners = new Set<(notification: Notification) => void>();
  let runtimeUnsubscribe: (() => void) | null = null;

  const handleRuntimeNotification = (payload: unknown) => {
    if (payload === undefined) {
      return;
    }

    for (const listener of listeners) {
      listener(payload as Notification);
    }
  };

  const releaseRuntimeListener = () => {
    if (runtimeUnsubscribe === null) {
      return;
    }

    const unsubscribe = runtimeUnsubscribe;
    runtimeUnsubscribe = null;
    unsubscribe();
  };

  const ensureRuntimeListener = () => {
    void waitForBindings(hasRuntimeBindings).then((isReady) => {
      if (!isReady || runtimeUnsubscribe !== null || listeners.size === 0) {
        return;
      }

      runtimeUnsubscribe = EventsOn(NOTIFICATION_EVENT_NAME, handleRuntimeNotification);
    });
  };

  NOTIFICATION_SOURCE_STATE.sharedSource = {
    subscribe(listener) {
      listeners.add(listener);
      ensureRuntimeListener();

      let subscribed = true;

      return () => {
        if (!subscribed) {
          return;
        }

        subscribed = false;
        listeners.delete(listener);

        if (listeners.size === 0) {
          releaseRuntimeListener();
        }
      };
    },
  };

  return NOTIFICATION_SOURCE_STATE.sharedSource;
}

/** Shared notification source singleton used by the app shell. */
export const notificationSource = createNotificationSource();
