import {
  CancelDownloadRun,
  GetDownloadConfig,
  GetJDMaxSimultaneousDownloads,
  GetJDStatus,
  GetScheduleConfig,
  IgnoreMissedSchedule,
	ListDownloadRuns,
	ListDownloadReadiness,
  RunMissedScheduleNow,
  SetHosterPriority,
  SetEpisodeRenameEnabled,
  SetJDConfig,
  SetScheduleConfig,
  TriggerAnimeDownload,
  TriggerDownloadCheck,
} from '../../../wailsjs/go/desktop/App';
import { EventsOn } from '../../../wailsjs/runtime/runtime';
import type { contracts } from '../../../wailsjs/go/models';
import {
  DOWNLOAD_RUN_EVENT_NAMES,
  DOWNLOAD_RUNTIME_SOURCE_STATE,
  MISSED_SCHEDULE_SETTLED_EVENT_NAME,
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

/**
 * Narrows a backend readiness reason string onto the closed frontend union,
 * throwing on an unknown one rather than widening the union silently.
 */
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

/** Maps one Wails readiness row onto its frontend contract shape. */
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

  const missedScheduleSettledSubscription = createRuntimeSubscription<void>((emit) => {
    return EventsOn(MISSED_SCHEDULE_SETTLED_EVENT_NAME, () => emit(undefined));
  });

  const source: DownloadRuntimeSource = {
    getDownloadConfig() {
      return invokeGoBinding('GetDownloadConfig', GetDownloadConfig, () => EMPTY_DOWNLOAD_CONFIG).then(normalizeDownloadConfig);
    },
    getJDStatus() {
      return invokeGoBinding('GetJDStatus', GetJDStatus, () => EMPTY_JD_STATUS);
    },
    getJDMaxSimultaneousDownloads() {
      return invokeGoBinding('GetJDMaxSimultaneousDownloads', GetJDMaxSimultaneousDownloads, () => 0);
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
    setEpisodeRenameEnabled(enabled) {
      return invokeGoBinding('SetEpisodeRenameEnabled', () => SetEpisodeRenameEnabled(enabled), () => 'runtime unavailable');
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
    subscribeMissedScheduleSettled(listener) {
      return missedScheduleSettledSubscription.subscribe(listener);
    },
  };

  DOWNLOAD_RUNTIME_SOURCE_STATE.sharedSource = source;
  return source;
}

/**
 * Shared download source singleton used across hooks and stores.
 *
 * Same placement as every other infrastructure source module's singleton --
 * `notification-source.helpers.ts` carries the identical suppression for the
 * identical reason. It cannot move to `.constants.ts` either: that file holds
 * the state container this one imports, so the move would introduce a cycle.
 * The rule stays on for genuinely new violations; this one is suppressed in
 * place so the debt is visible rather than silently disabled repo-wide.
 */
export const downloadRuntimeSource = createDownloadRuntimeSource(); // eslint-disable-line dharness/role-file-shape
