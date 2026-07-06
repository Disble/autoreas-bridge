import { GetSeasonMode } from '../../wailsjs/go/main/App';

/** Poll interval (ms) while waiting for the Wails runtime to become ready. */
export const PREFERENCES_BINDINGS_POLL_MS = 50;
/** Maximum time (ms) to wait for the Wails runtime before degrading to a safe default. */
export const PREFERENCES_BINDINGS_TIMEOUT_MS = 5000;

/**
 * PreferencesSource is the request/reply port for the preferences Wails bindings.
 * Degrades to safe defaults when the Wails runtime is unavailable (browser / Vite dev).
 * Season mode is READ-ONLY here (SDD-41b): it is derived from the open season and
 * changed only by creating/closing a season in the Season section.
 */
export interface PreferencesSource {
  readonly getSeasonMode: () => Promise<boolean>;
}

function hasGoBinding(name: string): boolean {
  const app = window.go?.main?.App;
  return typeof app === 'object' && app !== null && typeof (app as Record<string, unknown>)[name] === 'function';
}

function waitForBindings(isReady: () => boolean): Promise<boolean> {
  if (isReady()) {
    return Promise.resolve(true);
  }

  return new Promise<boolean>((resolve) => {
    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      const isTimedOut = Date.now() - startedAt >= PREFERENCES_BINDINGS_TIMEOUT_MS;

      if (isReady()) {
        window.clearInterval(intervalId);
        resolve(true);
        return;
      }

      if (isTimedOut) {
        window.clearInterval(intervalId);
        resolve(false);
      }
    }, PREFERENCES_BINDINGS_POLL_MS);
  });
}

let sharedSource: PreferencesSource | null = null;

/**
 * createPreferencesSource returns the singleton runtime-backed preferences
 * source. Degrades to safe defaults when the Wails runtime is unavailable.
 */
export function createPreferencesSource(): PreferencesSource {
  if (sharedSource !== null) {
    return sharedSource;
  }

  sharedSource = {
    getSeasonMode() {
      return waitForBindings(() => hasGoBinding('GetSeasonMode')).then((isReady) => {
        return isReady ? (GetSeasonMode() as Promise<boolean>) : Promise.resolve(false);
      });
    },
  };

  return sharedSource;
}

/**
 * preferencesSource exposes the shared runtime-backed preferences source to
 * every preferences feature hook.
 */
export const preferencesSource = createPreferencesSource();
