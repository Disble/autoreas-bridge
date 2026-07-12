/** Poll interval (ms) while waiting for Wails bindings to become ready. */
export const WAILS_BINDINGS_POLL_MS = 50;

/** Maximum time (ms) to wait for Wails bindings before degrading safely. */
export const WAILS_BINDINGS_TIMEOUT_MS = 5000;

/**
 * Checks whether a generated Go binding is currently attached to `window.go`.
 * Keeping this check shared removes repeated readiness plumbing while callers
 * still choose their own binding names, fallbacks, and payload handling.
 */
export function hasGoBinding(name: string): boolean {
  const app = window.go?.main?.App;

  return typeof app === 'object' && typeof app?.[name] === 'function';
}

/**
 * Checks whether the Wails runtime event bindings are currently attached.
 * Runtime subscriptions use a different global from Go methods, so this stays
 * separate from `hasGoBinding` instead of hiding adapter-specific assumptions.
 */
export function hasRuntimeBindings(): boolean {
  return typeof window.runtime?.EventsOnMultiple === 'function' || typeof window.runtime?.EventsOn === 'function';
}

/**
 * Polls an injected readiness predicate until it succeeds or the timeout is
 * reached. The predicate keeps adapter-specific readiness decisions at the
 * call site while this helper owns only the shared timing behavior.
 */
export function waitForBindings(
  isReady: () => boolean,
  pollMs = WAILS_BINDINGS_POLL_MS,
  timeoutMs = WAILS_BINDINGS_TIMEOUT_MS,
): Promise<boolean> {
  if (isReady()) {
    return Promise.resolve(true);
  }

  return new Promise<boolean>((resolve) => {
    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      const isTimedOut = Date.now() - startedAt >= timeoutMs;

      if (isReady()) {
        window.clearInterval(intervalId);
        resolve(true);
        return;
      }

      if (isTimedOut) {
        window.clearInterval(intervalId);
        resolve(false);
      }
    }, pollMs);
  });
}

/**
 * Invokes a generated Go binding only after it is available and otherwise
 * delegates the degraded result to the calling adapter's explicit fallback.
 */
export function invokeGoBinding<T>(
  bindingName: string,
  invoke: () => Promise<T>,
  fallback: () => T | Promise<T>,
): Promise<T> {
  return waitForBindings(() => hasGoBinding(bindingName)).then((isReady) => {
    return isReady ? invoke() : fallback();
  });
}

/**
 * Shares one Wails runtime listener across consumers and releases its runtime
 * subscriptions once the final consumer unsubscribes. Sources supply only the
 * event-specific attachment while this helper preserves the shared lifecycle.
 */
export function createRuntimeSubscription<T>(
  attachRuntime: (emit: (payload: T) => void) => (() => void) | readonly (() => void)[],
) {
  const listeners = new Set<(payload: T) => void>();
  let runtimeUnsubscribes: readonly (() => void)[] = [];

  const emit = (payload: T) => {
    for (const listener of listeners) {
      listener(payload);
    }
  };

  const releaseRuntimeListeners = () => {
    if (runtimeUnsubscribes.length === 0) {
      return;
    }

    const unsubscribes = runtimeUnsubscribes;
    runtimeUnsubscribes = [];
    for (const unsubscribe of unsubscribes) {
      unsubscribe();
    }
  };

  const ensureRuntimeListeners = () => {
    void waitForBindings(hasRuntimeBindings).then((isReady) => {
      if (!isReady || runtimeUnsubscribes.length > 0 || listeners.size === 0) {
        return;
      }

      const unsubscribe = attachRuntime(emit);
      runtimeUnsubscribes = typeof unsubscribe === 'function' ? [unsubscribe] : unsubscribe;
    });
  };

  return {
    subscribe(listener: (payload: T) => void) {
      listeners.add(listener);
      ensureRuntimeListeners();

      let subscribed = true;

      return () => {
        if (!subscribed) {
          return;
        }

        subscribed = false;
        listeners.delete(listener);

        if (listeners.size === 0) {
          releaseRuntimeListeners();
        }
      };
    },
  };
}
