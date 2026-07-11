import { GetRecentLogs } from '../../../wailsjs/go/main/App';
import { EventsOn } from '../../../wailsjs/runtime/runtime';
import type { ObservabilityLogEntry } from '../../shared/contracts/observability.types';
import { OBSERVABILITY_EVENT_NAME, OBSERVABILITY_LOG_SOURCE_STATE } from './observability-log-source.constants';
import type { ObservabilityLogSource } from './observability-log-source.types';
import { hasRuntimeBindings, waitForBindings } from '../wails-bindings.helpers';

/**
 * Reports whether the app is running inside a Wails-backed environment right now.
 * The live event bridge keeps its stricter readiness gate elsewhere because the
 * Network panel only needs to distinguish desktop runtime vs plain browser when
 * deciding whether to show the capture-unavailable warning.
 */
export function isWailsRuntimeAvailable(): boolean {
  return Boolean(window.go?.main?.App) && typeof window.runtime === 'object' && window.runtime !== null;
}

/**
 * Creates the singleton runtime-backed observability source with no-op degraded behavior.
 */
export function createObservabilityLogSource(): ObservabilityLogSource {
  if (OBSERVABILITY_LOG_SOURCE_STATE.sharedSource !== null) {
    return OBSERVABILITY_LOG_SOURCE_STATE.sharedSource;
  }

  const listeners = new Set<(entry: ObservabilityLogEntry) => void>();
  let runtimeUnsubscribe: (() => void) | null = null;

  const handleRuntimeEntry = (entry: unknown) => {
    if (entry === undefined) {
      return;
    }

    for (const listener of listeners) {
      listener(entry as ObservabilityLogEntry);
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

      runtimeUnsubscribe = EventsOn(OBSERVABILITY_EVENT_NAME, handleRuntimeEntry);
    });
  };

  OBSERVABILITY_LOG_SOURCE_STATE.sharedSource = {
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
    getRecentLogs() {
      return waitForBindings(() => Boolean(window.go?.main?.App)).then((isReady) => {
        return isReady ? (GetRecentLogs() as Promise<readonly ObservabilityLogEntry[]>) : Promise.resolve([]);
      });
    },
  };

  return OBSERVABILITY_LOG_SOURCE_STATE.sharedSource;
}

/** Shared observability source singleton used across hooks and stores. */
export const observabilityLogSource = createObservabilityLogSource();
