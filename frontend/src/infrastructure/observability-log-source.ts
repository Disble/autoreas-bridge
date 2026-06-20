import { GetRecentLogs } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import type { ObservabilityLogEntry } from '../shared/contracts/observability.types';

/** Poll interval (ms) while waiting for the Wails runtime to become ready. */
export const WAILS_BINDINGS_POLL_MS = 50;
/** Maximum time (ms) to wait for the Wails runtime before degrading to a no-op. */
export const WAILS_BINDINGS_TIMEOUT_MS = 5000;

const OBSERVABILITY_EVENT_NAME = 'observability.log';

let sharedSource: ObservabilityLogSource | null = null;

/**
 * ObservabilityLogSource is the STREAM port: live event subscription plus a
 * recent-log replay fetch. The only two members the Network store and
 * `use-observability-panel` depend on.
 */
export interface ObservabilityLogSource {
  /** Live runtime log stream. Returns an unsubscribe fn. No-op degrade in a plain browser. */
  readonly subscribe: (listener: (entry: ObservabilityLogEntry) => void) => () => void;
  /** Replay of the backend's retained recent log buffer. Resolves [] when the runtime is absent. */
  readonly getRecentLogs: () => Promise<readonly ObservabilityLogEntry[]>;
}

function hasGoBindings(): boolean {
  return Boolean(window.go?.main?.App);
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

/**
 * createObservabilityLogSource returns the singleton runtime-backed
 * observability log source. Degrades to no-op stream + empty replay when the
 * Wails runtime is unavailable (plain browser / Vite dev).
 */
export function createObservabilityLogSource(): ObservabilityLogSource {
  if (sharedSource !== null) {
    return sharedSource;
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
    getRecentLogs() {
      return waitForBindings(hasGoBindings).then((isReady) => {
        return isReady ? (GetRecentLogs() as Promise<readonly ObservabilityLogEntry[]>) : Promise.resolve([]);
      });
    },
  };

  return sharedSource;
}

/**
 * observabilityLogSource exposes the shared runtime-backed observability log
 * source to feature hooks and the Network store.
 */
export const observabilityLogSource = createObservabilityLogSource();
