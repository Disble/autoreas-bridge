import {
  GetEffectiveAddress,
  GetPairingToken,
  GetRecentLogs,
  GetSQLiteStatus,
  TriggerReconcile,
} from '../../../wailsjs/go/main/App';
import { EventsOn } from '../../../wailsjs/runtime/runtime';
import type { ObservabilityLogEntry } from './ui/ObservabilityPanel/observability-panel.types';

export const WAILS_BINDINGS_POLL_MS = 50;
export const WAILS_BINDINGS_TIMEOUT_MS = 5000;

function hasGoBindings() {
  return Boolean(window.go?.main?.App);
}

function hasRuntimeBindings() {
  return Boolean(window.runtime);
}

function waitForBindings(isReady: () => boolean) {
  if (isReady()) {
    return Promise.resolve(true);
  }

  return new Promise<boolean>((resolve) => {
    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      const isTimedOut = Date.now() - startedAt >= WAILS_BINDINGS_TIMEOUT_MS;

      if (isReady()) {
        window.clearInterval(intervalId);
        resolve(true);
        return;
      }

      if (isTimedOut) {
        window.clearInterval(intervalId);
        resolve(false);
      }
    }, WAILS_BINDINGS_POLL_MS);
  });
}

export function getSQLiteStatus() {
  return waitForBindings(hasGoBindings).then((isReady) => {
    return isReady ? GetSQLiteStatus() : 'runtime unavailable';
  });
}

export function getEffectiveAddress() {
  return waitForBindings(hasGoBindings).then((isReady) => {
    return isReady ? GetEffectiveAddress() : '';
  });
}

export function getPairingToken() {
  return waitForBindings(hasGoBindings).then((isReady) => {
    return isReady ? GetPairingToken() : '';
  });
}

export function triggerReconcile() {
  return waitForBindings(hasGoBindings).then((isReady) => {
    return isReady ? TriggerReconcile() : 'runtime unavailable';
  });
}

export function getRecentLogs() {
  return waitForBindings(hasGoBindings).then((isReady) => {
    return isReady ? (GetRecentLogs() as Promise<ObservabilityLogEntry[]>) : [];
  });
}

export function subscribeToEvent<TPayload = ObservabilityLogEntry>(eventName: string, callback: (entry: TPayload) => void) {
  let unsubscribe: () => void = () => {};
  let active = true;

  void waitForBindings(hasRuntimeBindings).then((isReady) => {
    if (!active || !isReady) {
      return;
    }

    unsubscribe = EventsOn(eventName, callback);
  });

  return () => {
    active = false;
    unsubscribe();
  };
}
