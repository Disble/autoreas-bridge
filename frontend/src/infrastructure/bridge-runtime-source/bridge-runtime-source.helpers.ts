import {
  AdjustWatchedChapters,
  CopyAnimeFolder,
  CopyAnimePage,
  GetAnimeCover,
  GetAnimeDetail,
  GetAnimeHistory,
  GetAnimes,
  GetChapterDayCounts,
  GetChapterSchedule,
  GetConnectedDevices,
  GetEffectiveAddress,
  GetPairingToken,
  GetSQLiteStatus,
  GetSyncingAnimeItems,
  OpenAnimeFolder,
  OpenAnimePage,
  PullAnimesFromLegacy,
  RepeatAnime,
  RestoreAnime,
  SetAnimeState,
  SoftDeleteAnime,
  TriggerReconcile,
  UnpairDevice,
} from '../../../wailsjs/go/main/App';
import { EventsOn } from '../../../wailsjs/runtime/runtime';
import type { AnimeLegacyPullResult } from '../../shared/contracts/anime.types';
import {
  BRIDGE_RUNTIME_SOURCE_STATE,
  PAIRING_TOKEN_CONSUMED_EVENT_NAME,
  RUNTIME_UNAVAILABLE_PULL_RESULT,
} from './bridge-runtime-source.constants';
import type { BridgeRuntimeSource } from './bridge-runtime-source.types';
import { hasGoBinding, hasRuntimeBindings, waitForBindings } from '../wails-bindings.helpers';

/**
 * Normalizes legacy-pull payloads to the frontend contract, forcing unknown statuses
 * into the degraded `error` state so callers never branch on backend-only variants.
 */
function toAnimeLegacyPullResult(
  result: AnimeLegacyPullResult | { readonly status: string; readonly message: string; readonly updatedCount: number; readonly prunedCount: number; readonly warningCount: number },
): AnimeLegacyPullResult {
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
 * Creates the singleton runtime-backed bridge source. It degrades every missing
 * Wails binding to safe defaults so browser/Vite contexts keep rendering.
 */
export function createBridgeRuntimeSource(): BridgeRuntimeSource {
  if (BRIDGE_RUNTIME_SOURCE_STATE.sharedSource !== null) {
    return BRIDGE_RUNTIME_SOURCE_STATE.sharedSource;
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

  BRIDGE_RUNTIME_SOURCE_STATE.sharedSource = {
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
        return isReady ? (GetSyncingAnimeItems() as Promise<readonly import('../../shared/contracts/syncing-anime.types').SyncingAnime[]>) : Promise.resolve([]);
      });
    },
    getAnimes() {
      return waitForBindings(() => hasGoBinding('GetAnimes')).then((isReady) => {
        return isReady ? (GetAnimes() as Promise<readonly import('../../shared/contracts/anime.types').Anime[]>) : Promise.resolve([]);
      });
    },
    getAnimeDetail(id) {
      return waitForBindings(() => hasGoBinding('GetAnimeDetail')).then((isReady) => {
        return isReady ? (GetAnimeDetail(id) as Promise<import('../../shared/contracts/anime.types').AnimeDetail | null>) : Promise.resolve(null);
      });
    },
    getAnimeHistory() {
      return waitForBindings(() => hasGoBinding('GetAnimeHistory')).then((isReady) => {
        return isReady ? (GetAnimeHistory() as Promise<readonly import('../../shared/contracts/anime.types').AnimeHistoryEntry[]>) : Promise.resolve([]);
      });
    },
    getChapterSchedule(day) {
      return waitForBindings(() => hasGoBinding('GetChapterSchedule')).then((isReady) => {
        return isReady ? GetChapterSchedule(day) : Promise.resolve([]);
      });
    },
    getAnimeCover(animeID) {
      return waitForBindings(() => hasGoBinding('GetAnimeCover')).then((isReady) => {
        return isReady ? GetAnimeCover(animeID) : Promise.resolve({ source: 'placeholder' });
      });
    },
    getChapterDayCounts() {
      return waitForBindings(() => hasGoBinding('GetChapterDayCounts')).then((isReady) => {
        return isReady ? GetChapterDayCounts() : Promise.resolve([]);
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
    repeatAnime(animeID, base) {
      return waitForBindings(() => hasGoBinding('RepeatAnime')).then((isReady) => {
        return isReady ? RepeatAnime(animeID, base) : Promise.resolve({ status: 'error', message: 'runtime unavailable' });
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
        return isReady ? GetConnectedDevices() : Promise.resolve([]);
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

  return BRIDGE_RUNTIME_SOURCE_STATE.sharedSource;
}

/** Shared bridge source singleton used across feature hooks and stores. */
export const bridgeRuntimeSource = createBridgeRuntimeSource();
