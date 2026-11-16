import {
  CancelDownloadRun,
  GetDownloadConfig,
  GetJDMaxSimultaneousDownloads,
  GetJDStatus,
  GetScheduleConfig,
  IgnoreMissedSchedule,
  ListDownloadReadiness,
  ListDownloadRuns,
  RunMissedScheduleNow,
  SetEpisodeRenameEnabled,
  SetHosterPriority,
  SetJDConfig,
  SetScheduleConfig,
  TriggerAnimeDownload,
  TriggerDownloadCheck,
} from '../../../wailsjs/go/desktop/App';
import type { contracts } from '../../../wailsjs/go/models';
import type {
  AnimeDownloadReadiness,
  DownloadConfig,
  DownloadReadinessReason,
  DownloadReadinessSnapshot,
  DownloadRunView,
  DownloadsSource,
  JDStatus,
  ScheduleConfig,
  ScheduleMissedActionResult,
} from '../../shared/contracts/download.types';
import { createBridgeError } from '../../shared/query/bridge-error/bridge-error.helpers';
import { withBridgeErrors } from '../bridge-error/bridge-error.helpers';
import { invokeGoBinding } from '../wails-bindings.helpers';

/**
 * Calls one downloads binding: its rejection becomes a `BridgeError`, and a
 * binding that never attaches rejects as `unavailable` instead of answering a
 * fallback value.
 * @param bindingName The `App` method name, as `window.go` exposes it.
 * @param call The generated binding call.
 * @returns What the binding answered.
 */
function callDownloadsBinding<T>(bindingName: string, call: () => Promise<T>): Promise<T> {
  return withBridgeErrors(
    invokeGoBinding(bindingName, call, () => Promise.reject(createBridgeError('unavailable', `the ${bindingName} binding is not attached`))),
  );
}

/**
 * Keeps `hosterPriority` an array for the UI whatever the payload carries.
 * @param config The binding's answer.
 * @returns The config with an array `hosterPriority`.
 */
function normalizeDownloadConfig(config: DownloadConfig): DownloadConfig {
  return {
    ...config,
    hosterPriority: Array.isArray(config.hosterPriority) ? config.hosterPriority : [],
  };
}

/**
 * Narrows a backend readiness reason string onto the closed frontend union,
 * throwing on an unknown one rather than widening the union silently.
 * @param reason The backend reason.
 * @returns The same reason, typed.
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

/**
 * Maps one Wails readiness row onto its frontend contract shape.
 * @param item The generated DTO row.
 * @returns The readonly contract row.
 */
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
 * @param snapshot The generated DTO.
 * @returns The readonly contract snapshot.
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
 * The Wails adapter of the `DownloadsSource` port (ADR-032 §4), built once in
 * `shared/query/bridge-runtime/bridge-runtime.constants.ts`. Every call rejects
 * with the module's `unavailable` / `failed_precondition` failure or the
 * command's refusal, never with an empty configuration or a status string.
 * @returns The source.
 */
export function createDownloadsSource(): DownloadsSource {
  return {
    getDownloadConfig: () =>
      callDownloadsBinding<DownloadConfig>('GetDownloadConfig', () => GetDownloadConfig()).then(normalizeDownloadConfig),
    getJDStatus: () => callDownloadsBinding<JDStatus>('GetJDStatus', () => GetJDStatus()),
    getJDMaxSimultaneousDownloads: () => callDownloadsBinding('GetJDMaxSimultaneousDownloads', () => GetJDMaxSimultaneousDownloads()),
    setJDConfig: (input) => callDownloadsBinding('SetJDConfig', () => SetJDConfig(input as contracts.JDConfigInput)),
    getScheduleConfig: () => callDownloadsBinding<ScheduleConfig>('GetScheduleConfig', () => GetScheduleConfig()),
    setScheduleConfig: (config) => callDownloadsBinding('SetScheduleConfig', () => SetScheduleConfig(config as contracts.ScheduleConfig)),
    setHosterPriority: (site, items) => callDownloadsBinding('SetHosterPriority', () => SetHosterPriority(site, [...items])),
    setEpisodeRenameEnabled: (enabled) => callDownloadsBinding('SetEpisodeRenameEnabled', () => SetEpisodeRenameEnabled(enabled)),
    triggerDownloadCheck: () => callDownloadsBinding('TriggerDownloadCheck', () => TriggerDownloadCheck()),
    triggerAnimeDownload: (animeId) => callDownloadsBinding('TriggerAnimeDownload', () => TriggerAnimeDownload(animeId)),
    cancelDownloadRun: () => callDownloadsBinding('CancelDownloadRun', () => CancelDownloadRun()),
    runMissedScheduleNow: (localDate) =>
      callDownloadsBinding<ScheduleMissedActionResult>('RunMissedScheduleNow', () => RunMissedScheduleNow(localDate)),
    ignoreMissedSchedule: (localDate) =>
      callDownloadsBinding<ScheduleMissedActionResult>('IgnoreMissedSchedule', () => IgnoreMissedSchedule(localDate)),
    listDownloadRuns: () => callDownloadsBinding<readonly DownloadRunView[]>('ListDownloadRuns', () => ListDownloadRuns()),
    listDownloadReadiness: () =>
      callDownloadsBinding('ListDownloadReadiness', () => ListDownloadReadiness()).then(mapDownloadReadinessSnapshot),
  };
}
