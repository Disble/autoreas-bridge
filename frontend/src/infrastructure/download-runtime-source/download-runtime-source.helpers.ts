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
import { createRuntimeSubscription, invokeGoBinding } from '../wails-bindings.helpers';

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

  const runSubscription = createRuntimeSubscription<void>((emit) => {
    return DOWNLOAD_RUN_EVENT_NAMES.map((eventName) => EventsOn(eventName, () => emit(undefined)));
  });

  DOWNLOAD_RUNTIME_SOURCE_STATE.sharedSource = {
    getDownloadConfig() {
      return invokeGoBinding('GetDownloadConfig', GetDownloadConfig, () => EMPTY_DOWNLOAD_CONFIG).then(normalizeDownloadConfig);
    },
    getJDStatus() {
      return invokeGoBinding('GetJDStatus', GetJDStatus, () => EMPTY_JD_STATUS);
    },
    setJDConfig(input) {
      return invokeGoBinding('SetJDConfig', () => SetJDConfig(input), () => 'runtime unavailable');
    },
    getScheduleConfig() {
      return invokeGoBinding('GetScheduleConfig', GetScheduleConfig, () => EMPTY_SCHEDULE_CONFIG);
    },
    setScheduleConfig(config) {
      return invokeGoBinding('SetScheduleConfig', () => SetScheduleConfig(config), () => 'runtime unavailable');
    },
    setHosterPriority(site, items) {
      return invokeGoBinding('SetHosterPriority', () => SetHosterPriority(site, [...items]), () => 'runtime unavailable');
    },
    triggerDownloadCheck() {
      return invokeGoBinding('TriggerDownloadCheck', TriggerDownloadCheck, () => 'runtime unavailable');
    },
    triggerAnimeDownload(animeID) {
      return invokeGoBinding('TriggerAnimeDownload', () => TriggerAnimeDownload(animeID), () => 'runtime unavailable');
    },
    listDownloadRuns() {
      return invokeGoBinding('ListDownloadRuns', ListDownloadRuns, () => []);
    },
    subscribeRunEvents(listener) {
      return runSubscription.subscribe(listener);
    },
  };

  return DOWNLOAD_RUNTIME_SOURCE_STATE.sharedSource;
}

/** Shared download source singleton used across hooks and stores. */
export const downloadRuntimeSource = createDownloadRuntimeSource();
