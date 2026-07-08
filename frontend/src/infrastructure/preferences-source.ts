import { GetDownloadsRoot, GetSeasonMode, PickFolder, SetDownloadsRoot } from '../../wailsjs/go/main/App';

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
  /** The configured global downloads root, or '' when unset / runtime unavailable. */
  readonly getDownloadsRoot: () => Promise<string>;
  /** Persists the global downloads root; resolves to 'ok' or an error string. */
  readonly setDownloadsRoot: (path: string) => Promise<string>;
  /** Opens the native folder picker; resolves to the chosen path or '' when cancelled. */
  readonly pickFolder: (title: string) => Promise<string>;
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
    getDownloadsRoot() {
      return waitForBindings(() => hasGoBinding('GetDownloadsRoot')).then((isReady) => {
        return isReady ? (GetDownloadsRoot() as Promise<string>) : Promise.resolve('');
      });
    },
    setDownloadsRoot(path: string) {
      return waitForBindings(() => hasGoBinding('SetDownloadsRoot')).then((isReady) => {
        return isReady ? (SetDownloadsRoot(path) as Promise<string>) : Promise.resolve('runtime unavailable');
      });
    },
    pickFolder(title: string) {
      return waitForBindings(() => hasGoBinding('PickFolder')).then((isReady) => {
        return isReady ? (PickFolder(title) as Promise<string>) : Promise.resolve('');
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
