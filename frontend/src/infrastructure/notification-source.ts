import { EventsOn } from '../../wailsjs/runtime/runtime';
import type { Notification } from '../shared/contracts/notification.types';

const NOTIFICATION_EVENT_NAME = 'notification.push';

/** Poll interval (ms) while waiting for the Wails runtime to become ready. */
export const NOTIFICATION_BINDINGS_POLL_MS = 50;
/** Maximum time (ms) to wait for the Wails runtime before degrading to a no-op. */
export const NOTIFICATION_BINDINGS_TIMEOUT_MS = 5000;

let sharedSource: NotificationSource | null = null;

/**
 * NotificationSource is the STREAM port the app-shell toast hook depends on:
 * live subscription to the backend's `notification.push` Wails runtime
 * event, mirroring `ObservabilityLogSource`. No replay/fetch member exists —
 * notifications are push-only, fire-and-forget moments.
 */
export interface NotificationSource {
  /** Live runtime notification stream. Returns an unsubscribe fn. No-op degrade in a plain browser. */
  readonly subscribe: (listener: (notification: Notification) => void) => () => void;
}

function hasRuntimeBindings(): boolean {
  return Boolean(window.runtime);
}

function waitForBindings(isReady: () => boolean): Promise<boolean> {
  if (isReady()) {
    return Promise.resolve(true);
  }

  return new Promise<boolean>((resolve) => {
    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      const isTimedOut = Date.now() - startedAt >= NOTIFICATION_BINDINGS_TIMEOUT_MS;

      if (isReady()) {
        window.clearInterval(intervalId);
        resolve(true);
        return;
      }

      if (isTimedOut) {
        window.clearInterval(intervalId);
        resolve(false);
      }
    }, NOTIFICATION_BINDINGS_POLL_MS);
  });
}

/**
 * createNotificationSource returns the singleton runtime-backed notification
 * source. Degrades to a no-op stream when the Wails runtime is unavailable
 * (plain browser / Vite dev).
 */
export function createNotificationSource(): NotificationSource {
  if (sharedSource !== null) {
    return sharedSource;
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

  sharedSource = {
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

  return sharedSource;
}

/**
 * notificationSource exposes the shared runtime-backed notification source
 * to the app-shell toast hook.
 */
export const notificationSource = createNotificationSource();
