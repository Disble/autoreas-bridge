import {
  GetDownloadConfig,
  GetJDStatus,
  GetScheduleConfig,
  ListDownloadRuns,
  SetHosterPriority,
  SetJDConfig,
  SetScheduleConfig,
  TriggerAnimeDownload,
  TriggerDownloadCheck,
} from '../../../wailsjs/go/main/App';
import { EventsOn } from '../../../wailsjs/runtime/runtime';
import {
  DOWNLOAD_RUN_EVENT_NAMES,
  DOWNLOAD_RUNTIME_SOURCE_STATE,
  EMPTY_DOWNLOAD_CONFIG,
  EMPTY_JD_STATUS,
  EMPTY_SCHEDULE_CONFIG,
} from './download-runtime-source.constants';
import type { DownloadRuntimeSource } from './download-runtime-source.types';
import { hasGoBinding, hasRuntimeBindings, waitForBindings } from '../wails-bindings.helpers';

/**
 * Normalizes the backend payload so `hosterPriority` is always an array for the UI.
 */
function normalizeDownloadConfig(config: import('../../shared/contracts/download.types').DownloadConfig): import('../../shared/contracts/download.types').DownloadConfig {
  return {
    ...config,
    hosterPriority: Array.isArray(config.hosterPriority) ? config.hosterPriority : [],
  };
}

/**
 * Creates the singleton runtime-backed download source with safe degraded fallbacks.
 */
export function createDownloadRuntimeSource(): DownloadRuntimeSource {
  if (DOWNLOAD_RUNTIME_SOURCE_STATE.sharedSource !== null) {
    return DOWNLOAD_RUNTIME_SOURCE_STATE.sharedSource;
  }

  const runListeners = new Set<() => void>();
  let runtimeUnsubscribes: readonly (() => void)[] = [];

  const handleRunEvent = () => {
    for (const listener of runListeners) {
      listener();
    }
  };

  const releaseRunRuntimeListeners = () => {
    if (runtimeUnsubscribes.length === 0) {
      return;
    }

    const unsubscribes = runtimeUnsubscribes;
    runtimeUnsubscribes = [];
    for (const unsubscribe of unsubscribes) {
      unsubscribe();
    }
  };

  const ensureRunRuntimeListeners = () => {
    void waitForBindings(hasRuntimeBindings).then((isReady) => {
      if (!isReady || runtimeUnsubscribes.length > 0 || runListeners.size === 0) {
        return;
      }

      runtimeUnsubscribes = DOWNLOAD_RUN_EVENT_NAMES.map((eventName) => EventsOn(eventName, handleRunEvent));
    });
  };

  DOWNLOAD_RUNTIME_SOURCE_STATE.sharedSource = {
    getDownloadConfig() {
      return waitForBindings(() => hasGoBinding('GetDownloadConfig')).then((isReady) => {
        return isReady
          ? (GetDownloadConfig() as Promise<import('../../shared/contracts/download.types').DownloadConfig>).then(normalizeDownloadConfig)
          : Promise.resolve(EMPTY_DOWNLOAD_CONFIG);
      });
    },
    getJDStatus() {
      return waitForBindings(() => hasGoBinding('GetJDStatus')).then((isReady) => {
        return isReady ? (GetJDStatus() as Promise<import('../../shared/contracts/download.types').JDStatus>) : Promise.resolve(EMPTY_JD_STATUS);
      });
    },
    setJDConfig(input) {
      return waitForBindings(() => hasGoBinding('SetJDConfig')).then((isReady) => {
        return isReady ? SetJDConfig(input) : Promise.resolve('runtime unavailable');
      });
    },
    getScheduleConfig() {
      return waitForBindings(() => hasGoBinding('GetScheduleConfig')).then((isReady) => {
        return isReady ? (GetScheduleConfig() as Promise<import('../../shared/contracts/download.types').ScheduleConfig>) : Promise.resolve(EMPTY_SCHEDULE_CONFIG);
      });
    },
    setScheduleConfig(config) {
      return waitForBindings(() => hasGoBinding('SetScheduleConfig')).then((isReady) => {
        return isReady ? SetScheduleConfig(config) : Promise.resolve('runtime unavailable');
      });
    },
    setHosterPriority(site, items) {
      return waitForBindings(() => hasGoBinding('SetHosterPriority')).then((isReady) => {
        return isReady ? SetHosterPriority(site, [...items]) : Promise.resolve('runtime unavailable');
      });
    },
    triggerDownloadCheck() {
      return waitForBindings(() => hasGoBinding('TriggerDownloadCheck')).then((isReady) => {
        return isReady ? TriggerDownloadCheck() : Promise.resolve('runtime unavailable');
      });
    },
    triggerAnimeDownload(animeID) {
      return waitForBindings(() => hasGoBinding('TriggerAnimeDownload')).then((isReady) => {
        return isReady ? TriggerAnimeDownload(animeID) : Promise.resolve('runtime unavailable');
      });
    },
    listDownloadRuns() {
      return waitForBindings(() => hasGoBinding('ListDownloadRuns')).then((isReady) => {
        return isReady ? (ListDownloadRuns() as Promise<readonly import('../../shared/contracts/download.types').DownloadRunView[]>) : Promise.resolve([]);
      });
    },
    subscribeRunEvents(listener) {
      runListeners.add(listener);
      ensureRunRuntimeListeners();

      let subscribed = true;

      return () => {
        if (!subscribed) {
          return;
        }

        subscribed = false;
        runListeners.delete(listener);

        if (runListeners.size === 0) {
          releaseRunRuntimeListeners();
        }
      };
    },
  };

  return DOWNLOAD_RUNTIME_SOURCE_STATE.sharedSource;
}

/** Shared download source singleton used across hooks and stores. */
export const downloadRuntimeSource = createDownloadRuntimeSource();
