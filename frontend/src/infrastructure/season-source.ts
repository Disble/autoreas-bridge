import {
  CloseSeason,
  CreateSeason,
  DiscardSeasonName,
  GetSeason,
  GetSeasonAnimes,
  RecheckSeasonAvailability,
  ReconcileSeasonIntake,
  ResolveSeasonMatch,
  RunSeasonMatching,
  SendSeasonAnimesToVerHoy,
  SetAnimeDays,
  SetSeasonGrade,
  SetSeasonMinApprovalGrade,
  SetSeasonSlots,
  SkipSeasonGrading,
} from '../../wailsjs/go/main/App';

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

/** One ranked candidate for an ambiguous intake row. */
export interface SeasonAnimeCandidate {
  readonly title: string;
  readonly pageUrl: string;
  readonly score: number;
}

/** One intake/matching row of the active season. */
export interface SeasonAnimeRow {
  readonly id: string;
  readonly rawName: string;
  readonly matchStatus: string;
  readonly matchedSlug: string;
  readonly candidates: readonly SeasonAnimeCandidate[];
  readonly availability: string;
  readonly animeId: string;
  /** A created anime's current Estrenos section (Sin ver / Ver hoy / Visto); empty otherwise. */
  readonly section: string;
  /** First-episode grade (1–6); 0 means ungraded. */
  readonly grade: number;
  /** How the grade was captured: 'mobile_sync' | 'manual' | '' when ungraded. */
  readonly gradeSource: string;
  /** Epoch ms when the grade was recorded; absent until graded. */
  readonly ratedAt?: number;
  /** Explicit "no grade" override recorded at selection time. */
  readonly skipGrading: boolean;
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
  readonly getSeasonAnimes: () => Promise<readonly SeasonAnimeRow[]>;
  readonly reconcileIntake: (rawText: string) => Promise<string>;
  readonly runMatching: () => Promise<string>;
  readonly resolveMatch: (rowId: string, pageUrl: string) => Promise<string>;
  readonly discardName: (rowId: string) => Promise<string>;
  readonly setAnimeDays: (animeId: string, dias: readonly string[]) => Promise<string>;
  readonly sendToVerHoy: (animeIds: readonly string[]) => Promise<string>;
  readonly setGrade: (animeId: string, grade: number) => Promise<string>;
  readonly skipGrading: (rowId: string) => Promise<string>;
  readonly recheckAvailability: () => Promise<string>;
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
    getSeasonAnimes() {
      return waitForBindings(() => hasGoBinding('GetSeasonAnimes')).then((isReady) => {
        return isReady ? (GetSeasonAnimes() as Promise<readonly SeasonAnimeRow[]>) : Promise.resolve([]);
      });
    },
    reconcileIntake(rawText: string) {
      return waitForBindings(() => hasGoBinding('ReconcileSeasonIntake')).then((isReady) => {
        return isReady ? ReconcileSeasonIntake(rawText) : Promise.resolve(SEASON_RUNTIME_UNAVAILABLE);
      });
    },
    runMatching() {
      return waitForBindings(() => hasGoBinding('RunSeasonMatching')).then((isReady) => {
        return isReady ? RunSeasonMatching() : Promise.resolve(SEASON_RUNTIME_UNAVAILABLE);
      });
    },
    resolveMatch(rowId: string, pageUrl: string) {
      return waitForBindings(() => hasGoBinding('ResolveSeasonMatch')).then((isReady) => {
        return isReady ? ResolveSeasonMatch(rowId, pageUrl) : Promise.resolve(SEASON_RUNTIME_UNAVAILABLE);
      });
    },
    discardName(rowId: string) {
      return waitForBindings(() => hasGoBinding('DiscardSeasonName')).then((isReady) => {
        return isReady ? DiscardSeasonName(rowId) : Promise.resolve(SEASON_RUNTIME_UNAVAILABLE);
      });
    },
    setAnimeDays(animeId: string, dias: readonly string[]) {
      return waitForBindings(() => hasGoBinding('SetAnimeDays')).then((isReady) => {
        if (!isReady) {
          return SEASON_RUNTIME_UNAVAILABLE;
        }
        // base 0 relies on the app's staged-rollout OCCObserveOnly=true (last-call-wins);
        // section moves have no client-held OCC token yet.
        return SetAnimeDays(animeId, [...dias], 0).then((result) =>
          result.status === 'ok' ? 'ok' : result.message || 'Failed to move anime',
        );
      });
    },
    sendToVerHoy(animeIds: readonly string[]) {
      return waitForBindings(() => hasGoBinding('SendSeasonAnimesToVerHoy')).then((isReady) => {
        return isReady ? SendSeasonAnimesToVerHoy([...animeIds]) : Promise.resolve(SEASON_RUNTIME_UNAVAILABLE);
      });
    },
    setGrade(animeId: string, grade: number) {
      return waitForBindings(() => hasGoBinding('SetSeasonGrade')).then((isReady) => {
        return isReady ? SetSeasonGrade(animeId, grade) : Promise.resolve(SEASON_RUNTIME_UNAVAILABLE);
      });
    },
    skipGrading(rowId: string) {
      return waitForBindings(() => hasGoBinding('SkipSeasonGrading')).then((isReady) => {
        return isReady ? SkipSeasonGrading(rowId) : Promise.resolve(SEASON_RUNTIME_UNAVAILABLE);
      });
    },
    recheckAvailability() {
      return waitForBindings(() => hasGoBinding('RecheckSeasonAvailability')).then((isReady) => {
        return isReady ? RecheckSeasonAvailability() : Promise.resolve(SEASON_RUNTIME_UNAVAILABLE);
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
