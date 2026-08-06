import {
  CancelDownloadRun,
  GetDownloadConfig,
  GetJDStatus,
  GetScheduleConfig,
  IgnoreMissedSchedule,
	ListDownloadRuns,
	ListDownloadReadiness,
  RunMissedScheduleNow,
  SetHosterPriority,
  SetJDConfig,
  SetScheduleConfig,
  TriggerAnimeDownload,
  TriggerDownloadCheck,
} from '../../../wailsjs/go/main/App';
import { EventsOn } from '../../../wailsjs/runtime/runtime';
import type { contracts } from '../../../wailsjs/go/models';
import {
  DOWNLOAD_RUN_EVENT_NAMES,
  DOWNLOAD_RUNTIME_SOURCE_STATE,
  EMPTY_DOWNLOAD_CONFIG,
  EMPTY_JD_STATUS,
  EMPTY_SCHEDULE_CONFIG,
  createRuntimeUnavailableMissedActionResult,
} from './download-runtime-source.constants';
import type { AnimeDownloadReadiness, DownloadReadinessReason, DownloadReadinessSnapshot } from '../../shared/contracts/download.types';
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

function mapDownloadReadinessReason(reason: string): DownloadReadinessReason {
  switch (reason) {
    case 'missing_source':
    case 'invalid_source':
    case 'unsupported_source':
    case 'destination_unresolved':
      return reason;
    default:
      throw new Error(`Unknown download readiness reason: ${reason}`);
  }
}

function mapDownloadReadinessItem(item: contracts.AnimeDownloadReadiness): AnimeDownloadReadiness {
  return {
    animeId: item.animeId,
    name: item.name,
    ready: item.ready,
    reasons: item.reasons.map(mapDownloadReadinessReason),
    scheduledToday: item.scheduledToday,
  };
}

/**
 * Converts the mutable generated Wails readiness DTO into the readonly frontend contract.
 * Validation rejects backend reason drift so the UI cannot silently display an unknown blocker.
 */
export function mapDownloadReadinessSnapshot(snapshot: contracts.DownloadReadinessSnapshot): DownloadReadinessSnapshot {
  return {
    items: snapshot.items.map(mapDownloadReadinessItem),
    scheduledTotal: snapshot.scheduledTotal,
    scheduledReady: snapshot.scheduledReady,
    scheduledBlocked: snapshot.scheduledBlocked,
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

  const source: DownloadRuntimeSource = {
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
      return invokeGoBinding('SetScheduleConfig', () => SetScheduleConfig(config as never), () => 'runtime unavailable');
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
    cancelDownloadRun() {
      return invokeGoBinding('CancelDownloadRun', CancelDownloadRun, () => 'runtime unavailable');
    },
    runMissedScheduleNow(localDate) {
      return invokeGoBinding('RunMissedScheduleNow', () => RunMissedScheduleNow(localDate), () => createRuntimeUnavailableMissedActionResult(localDate));
    },
    ignoreMissedSchedule(localDate) {
      return invokeGoBinding('IgnoreMissedSchedule', () => IgnoreMissedSchedule(localDate), () => createRuntimeUnavailableMissedActionResult(localDate));
    },
	listDownloadRuns() {
		return invokeGoBinding('ListDownloadRuns', ListDownloadRuns, () => []);
	},
	listDownloadReadiness() {
		return invokeGoBinding('ListDownloadReadiness', ListDownloadReadiness, () => {
			throw new Error('runtime unavailable');
		}).then(mapDownloadReadinessSnapshot);
	},
    subscribeRunEvents(listener) {
      return runSubscription.subscribe(listener);
    },
  };

  DOWNLOAD_RUNTIME_SOURCE_STATE.sharedSource = source;
  return source;
}

/** Shared download source singleton used across hooks and stores. */
export const downloadRuntimeSource = createDownloadRuntimeSource();
