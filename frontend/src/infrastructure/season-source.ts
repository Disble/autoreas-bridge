import { CloseSeason, CreateSeason, GetSeason, SetSeasonMinApprovalGrade, SetSeasonSlots } from '../../wailsjs/go/main/App';

/** Poll interval (ms) while waiting for the Wails runtime to become ready. */
export const SEASON_BINDINGS_POLL_MS = 50;
/** Maximum time (ms) to wait for the Wails runtime before degrading to a safe default. */
export const SEASON_BINDINGS_TIMEOUT_MS = 5000;

/** Runtime-unavailable sentinel returned by mutators when Wails is not ready. */
export const SEASON_RUNTIME_UNAVAILABLE = 'runtime unavailable';

/**
 * SeasonSnapshot is the frontend-facing shape of the active season. Timestamps
 * are epoch milliseconds; the milestone fields are absent until reached.
 */
export interface SeasonSnapshot {
  readonly id: string;
  readonly name: string;
  readonly minApprovalGrade: number;
  readonly slots: number;
  readonly status: string;
  readonly selectionConfirmedAt?: number;
  readonly appliedAt?: number;
  readonly closedAt?: number;
  readonly createdAt: number;
}

/**
 * SeasonSource is the request/reply port for the season Wails bindings.
 * Degrades to safe defaults when the Wails runtime is unavailable (browser / Vite dev).
 */
export interface SeasonSource {
  readonly getSeason: () => Promise<SeasonSnapshot | null>;
  readonly createSeason: (name: string) => Promise<string>;
  readonly setMinApprovalGrade: (grade: number) => Promise<string>;
  readonly setSlots: (slots: number) => Promise<string>;
  readonly closeSeason: () => Promise<string>;
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
      const isTimedOut = Date.now() - startedAt >= SEASON_BINDINGS_TIMEOUT_MS;

      if (isReady()) {
        window.clearInterval(intervalId);
        resolve(true);
        return;
      }

      if (isTimedOut) {
        window.clearInterval(intervalId);
        resolve(false);
      }
    }, SEASON_BINDINGS_POLL_MS);
  });
}

let sharedSource: SeasonSource | null = null;

/**
 * createSeasonSource returns the singleton runtime-backed season source.
 * Degrades to safe defaults when the Wails runtime is unavailable.
 */
export function createSeasonSource(): SeasonSource {
  if (sharedSource !== null) {
    return sharedSource;
  }

  sharedSource = {
    getSeason() {
      return waitForBindings(() => hasGoBinding('GetSeason')).then((isReady) => {
        return isReady ? (GetSeason() as Promise<SeasonSnapshot | null>) : Promise.resolve(null);
      });
    },
    createSeason(name: string) {
      return waitForBindings(() => hasGoBinding('CreateSeason')).then((isReady) => {
        return isReady ? CreateSeason(name) : Promise.resolve(SEASON_RUNTIME_UNAVAILABLE);
      });
    },
    setMinApprovalGrade(grade: number) {
      return waitForBindings(() => hasGoBinding('SetSeasonMinApprovalGrade')).then((isReady) => {
        return isReady ? SetSeasonMinApprovalGrade(grade) : Promise.resolve(SEASON_RUNTIME_UNAVAILABLE);
      });
    },
    setSlots(slots: number) {
      return waitForBindings(() => hasGoBinding('SetSeasonSlots')).then((isReady) => {
        return isReady ? SetSeasonSlots(slots) : Promise.resolve(SEASON_RUNTIME_UNAVAILABLE);
      });
    },
    closeSeason() {
      return waitForBindings(() => hasGoBinding('CloseSeason')).then((isReady) => {
        return isReady ? CloseSeason() : Promise.resolve(SEASON_RUNTIME_UNAVAILABLE);
      });
    },
  };

  return sharedSource;
}

/**
 * seasonSource exposes the shared runtime-backed season source to every season
 * feature hook and the season store.
 */
export const seasonSource = createSeasonSource();
