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

  return typeof app === 'object' && app !== null && typeof app[name] === 'function';
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
