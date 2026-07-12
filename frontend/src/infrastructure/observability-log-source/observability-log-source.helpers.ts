import { GetRecentLogs } from '../../../wailsjs/go/main/App';
import { EventsOn } from '../../../wailsjs/runtime/runtime';
import type { ObservabilityLogEntry } from '../../shared/contracts/observability.types';
import { OBSERVABILITY_EVENT_NAME, OBSERVABILITY_LOG_SOURCE_STATE } from './observability-log-source.constants';
import type { ObservabilityLogSource } from './observability-log-source.types';
import { createRuntimeSubscription, waitForBindings } from '../wails-bindings.helpers';

/**
 * Reports whether the app is running inside a Wails-backed environment right now.
 * The live event bridge keeps its stricter readiness gate elsewhere because the
 * Network panel only needs to distinguish desktop runtime vs plain browser when
 * deciding whether to show the capture-unavailable warning.
 */
export function isWailsRuntimeAvailable(): boolean {
  const runtime = window.runtime;

  return Boolean(window.go?.main?.App) && typeof runtime === 'object' && runtime instanceof Object;
}

/**
 * Creates the singleton runtime-backed observability source with no-op degraded behavior.
 */
export function createObservabilityLogSource(): ObservabilityLogSource {
  if (OBSERVABILITY_LOG_SOURCE_STATE.sharedSource !== null) {
    return OBSERVABILITY_LOG_SOURCE_STATE.sharedSource;
  }

  const logSubscription = createRuntimeSubscription<ObservabilityLogEntry>((emit) => {
    return EventsOn(OBSERVABILITY_EVENT_NAME, (entry: unknown) => {
      if (entry !== undefined) {
        emit(entry as ObservabilityLogEntry);
      }
    });
  });

  OBSERVABILITY_LOG_SOURCE_STATE.sharedSource = {
    subscribe(listener) {
      return logSubscription.subscribe(listener);
    },
    getRecentLogs() {
      return waitForBindings(() => Boolean(window.go?.main?.App)).then((isReady) => {
        return isReady ? GetRecentLogs() : Promise.resolve([]);
      });
    },
  };

  return OBSERVABILITY_LOG_SOURCE_STATE.sharedSource;
}

/** Shared observability source singleton used across hooks and stores. */
export const observabilityLogSource = createObservabilityLogSource();
