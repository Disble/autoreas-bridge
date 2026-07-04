import {
  AdjustWatchedChapters,
  CopyAnimeFolder,
  CopyAnimePage,
  GetAnimes,
  GetAnimeDetail,
  GetChapterSchedule,
  GetConnectedDevices,
  GetEffectiveAddress,
  GetPairingToken,
  OpenAnimeFolder,
  OpenAnimePage,
  PullAnimesFromLegacy,
  RestoreAnime,
  GetSyncingAnimeItems,
  GetSQLiteStatus,
  SetAnimeState,
  SoftDeleteAnime,
  TriggerReconcile,
  UnpairDevice,
} from '../../wailsjs/go/main/App';
import type { contracts } from '../../wailsjs/go/models';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import type { Anime, AnimeLegacyPullResult } from '../shared/contracts/anime.types';
import type { SyncingAnime } from '../shared/contracts/syncing-anime.types';

/** Poll interval (ms) while waiting for the Wails runtime to become ready. */
export const WAILS_BINDINGS_POLL_MS = 50;
/** Maximum time (ms) to wait for the Wails runtime before degrading to a no-op. */
export const WAILS_BINDINGS_TIMEOUT_MS = 5000;

const PAIRING_TOKEN_CONSUMED_EVENT_NAME = 'pairing.token-consumed';
const RUNTIME_UNAVAILABLE_PULL_RESULT: AnimeLegacyPullResult = {
  message: 'runtime unavailable',
  prunedCount: 0,
  status: 'error',
  updatedCount: 0,
  warningCount: 0,
};

let sharedSource: BridgeRuntimeSource | null = null;

/**
 * BridgeRuntimeSource is the request/reply port: the four Wails bindings
 * consumed by status/pairing/dashboard hooks plus the rarely-firing
 * pairing-consumed event subscription.
 */
export interface BridgeRuntimeSource {
  readonly getSQLiteStatus: () => Promise<string>;
  readonly getEffectiveAddress: () => Promise<string>;
  readonly getPairingToken: () => Promise<string>;
  readonly getSyncingAnimeItems: () => Promise<readonly SyncingAnime[]>;
  readonly getAnimes: () => Promise<readonly Anime[]>;
  readonly getAnimeDetail?: (animeID: string) => Promise<contracts.AnimeDetail>;
  readonly getChapterSchedule?: (day: string) => Promise<readonly contracts.ChapterScheduleItem[]>;
  readonly adjustWatchedChapters?: (animeID: string, delta: number, base: number) => Promise<contracts.ChapterCommandResult>;
  readonly setAnimeState?: (animeID: string, estado: number, base: number) => Promise<contracts.ChapterCommandResult>;
  readonly softDeleteAnime?: (animeID: string, base: number) => Promise<contracts.ChapterCommandResult>;
  readonly restoreAnime?: (animeID: string, base: number) => Promise<contracts.ChapterCommandResult>;
  readonly openAnimePage?: (animeID: string) => Promise<contracts.ChapterCommandResult>;
  readonly copyAnimePage?: (animeID: string) => Promise<contracts.ChapterCommandResult>;
  readonly openAnimeFolder?: (animeID: string) => Promise<contracts.ChapterCommandResult>;
  readonly copyAnimeFolder?: (animeID: string) => Promise<contracts.ChapterCommandResult>;
  readonly getConnectedDevices?: () => Promise<readonly contracts.DeviceInfo[]>;
  readonly pullAnimesFromLegacy: () => Promise<AnimeLegacyPullResult>;
  readonly triggerReconcile: () => Promise<string>;
  readonly unpairDevice?: (deviceID: string) => Promise<string>;
  /** Fires when the active pairing token is consumed. Returns an unsubscribe fn. */
  readonly onPairingTokenConsumed: (listener: () => void) => () => void;
}

function hasGoBinding(name: string): boolean {
  const app = window.go?.main?.App;
  return typeof app === 'object' && app !== null && typeof (app as Record<string, unknown>)[name] === 'function';
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

function toAnimeLegacyPullResult(result: AnimeLegacyPullResult | { readonly status: string; readonly message: string; readonly updatedCount: number; readonly prunedCount: number; readonly warningCount: number }): AnimeLegacyPullResult {
  if (result.status === 'ok' || result.status === 'error' || result.status === 'in_progress') {
    return {
      message: result.message,
      prunedCount: result.prunedCount,
      status: result.status,
      updatedCount: result.updatedCount,
      warningCount: result.warningCount,
    };
  }

  return {
    message: result.message,
    prunedCount: result.prunedCount,
    status: 'error',
    updatedCount: result.updatedCount,
    warningCount: result.warningCount,
  };
}

/**
 * createBridgeRuntimeSource returns the singleton runtime-backed bridge
 * request/reply source. Degrades to safe defaults and a no-op event
 * subscription when the Wails runtime is unavailable.
 */
export function createBridgeRuntimeSource(): BridgeRuntimeSource {
  if (sharedSource !== null) {
    return sharedSource;
  }

  const listeners = new Set<() => void>();
  let runtimeUnsubscribe: (() => void) | null = null;

  const handleRuntimeEvent = () => {
    for (const listener of listeners) {
      listener();
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

      runtimeUnsubscribe = EventsOn(PAIRING_TOKEN_CONSUMED_EVENT_NAME, handleRuntimeEvent);
    });
  };

  sharedSource = {
    getSQLiteStatus() {
      return waitForBindings(() => hasGoBinding('GetSQLiteStatus')).then((isReady) => {
        return isReady ? GetSQLiteStatus() : 'runtime unavailable';
      });
    },
    getEffectiveAddress() {
      return waitForBindings(() => hasGoBinding('GetEffectiveAddress')).then((isReady) => {
        return isReady ? GetEffectiveAddress() : '';
      });
    },
    getPairingToken() {
      return waitForBindings(() => hasGoBinding('GetPairingToken')).then((isReady) => {
        return isReady ? GetPairingToken() : '';
      });
    },
    getSyncingAnimeItems() {
      return waitForBindings(() => hasGoBinding('GetSyncingAnimeItems')).then((isReady) => {
        return isReady ? (GetSyncingAnimeItems() as Promise<readonly SyncingAnime[]>) : Promise.resolve([]);
      });
    },
    getAnimes() {
      return waitForBindings(() => hasGoBinding('GetAnimes')).then((isReady) => {
        return isReady ? (GetAnimes() as Promise<readonly Anime[]>) : Promise.resolve([]);
      });
    },
    getAnimeDetail(animeID) {
      return waitForBindings(() => hasGoBinding('GetAnimeDetail')).then((isReady) => {
        return isReady ? GetAnimeDetail(animeID) : Promise.resolve({} as contracts.AnimeDetail);
      });
    },
    getChapterSchedule(day) {
      return waitForBindings(() => hasGoBinding('GetChapterSchedule')).then((isReady) => {
        return isReady ? (GetChapterSchedule(day) as Promise<readonly contracts.ChapterScheduleItem[]>) : Promise.resolve([]);
      });
    },
    adjustWatchedChapters(animeID, delta, base) {
      return waitForBindings(() => hasGoBinding('AdjustWatchedChapters')).then((isReady) => {
        return isReady ? AdjustWatchedChapters(animeID, delta, base) : Promise.resolve({ status: 'error', message: 'runtime unavailable' });
      });
    },
    setAnimeState(animeID, estado, base) {
      return waitForBindings(() => hasGoBinding('SetAnimeState')).then((isReady) => {
        return isReady ? SetAnimeState(animeID, estado, base) : Promise.resolve({ status: 'error', message: 'runtime unavailable' });
      });
    },
    softDeleteAnime(animeID, base) {
      return waitForBindings(() => hasGoBinding('SoftDeleteAnime')).then((isReady) => {
        return isReady ? SoftDeleteAnime(animeID, base) : Promise.resolve({ status: 'error', message: 'runtime unavailable' });
      });
    },
    restoreAnime(animeID, base) {
      return waitForBindings(() => hasGoBinding('RestoreAnime')).then((isReady) => {
        return isReady ? RestoreAnime(animeID, base) : Promise.resolve({ status: 'error', message: 'runtime unavailable' });
      });
    },
    openAnimePage(animeID) {
      return waitForBindings(() => hasGoBinding('OpenAnimePage')).then((isReady) => {
        return isReady ? OpenAnimePage(animeID) : Promise.resolve({ status: 'error', message: 'runtime unavailable' });
      });
    },
    copyAnimePage(animeID) {
      return waitForBindings(() => hasGoBinding('CopyAnimePage')).then((isReady) => {
        return isReady ? CopyAnimePage(animeID) : Promise.resolve({ status: 'error', message: 'runtime unavailable' });
      });
    },
    openAnimeFolder(animeID) {
      return waitForBindings(() => hasGoBinding('OpenAnimeFolder')).then((isReady) => {
        return isReady ? OpenAnimeFolder(animeID) : Promise.resolve({ status: 'error', message: 'runtime unavailable' });
      });
    },
    copyAnimeFolder(animeID) {
      return waitForBindings(() => hasGoBinding('CopyAnimeFolder')).then((isReady) => {
        return isReady ? CopyAnimeFolder(animeID) : Promise.resolve({ status: 'error', message: 'runtime unavailable' });
      });
    },
    getConnectedDevices() {
      return waitForBindings(() => hasGoBinding('GetConnectedDevices')).then((isReady) => {
        return isReady ? (GetConnectedDevices() as Promise<readonly contracts.DeviceInfo[]>) : Promise.resolve([]);
      });
    },
    pullAnimesFromLegacy() {
      return waitForBindings(() => hasGoBinding('PullAnimesFromLegacy')).then((isReady) => {
        return isReady ? PullAnimesFromLegacy().then(toAnimeLegacyPullResult) : RUNTIME_UNAVAILABLE_PULL_RESULT;
      });
    },
    triggerReconcile() {
      return waitForBindings(() => hasGoBinding('TriggerReconcile')).then((isReady) => {
        return isReady ? TriggerReconcile() : 'runtime unavailable';
      });
    },
    unpairDevice(deviceID) {
      return waitForBindings(() => hasGoBinding('UnpairDevice')).then((isReady) => {
        return isReady ? UnpairDevice(deviceID) : 'runtime unavailable';
      });
    },
    onPairingTokenConsumed(listener) {
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
  };

  return sharedSource;
}

/**
 * bridgeRuntimeSource exposes the shared runtime-backed bridge source to
 * feature hooks (status card, pairing panel, dashboard).
 */
export const bridgeRuntimeSource = createBridgeRuntimeSource();
