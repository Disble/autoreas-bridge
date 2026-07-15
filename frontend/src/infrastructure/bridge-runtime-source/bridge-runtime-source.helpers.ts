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
  RUNTIME_UNAVAILABLE_COMMAND_RESULT,
  RUNTIME_UNAVAILABLE_PULL_RESULT,
} from './bridge-runtime-source.constants';
import type { BridgeRuntimeSource } from './bridge-runtime-source.types';
import { createRuntimeSubscription, invokeGoBinding } from '../wails-bindings.helpers';

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

  const pairingTokenSubscription = createRuntimeSubscription<void>((emit) => {
    return EventsOn(PAIRING_TOKEN_CONSUMED_EVENT_NAME, () => emit(undefined));
  });

  BRIDGE_RUNTIME_SOURCE_STATE.sharedSource = {
    getSQLiteStatus() {
      return invokeGoBinding('GetSQLiteStatus', GetSQLiteStatus, () => 'runtime unavailable');
    },
    getEffectiveAddress() {
      return invokeGoBinding('GetEffectiveAddress', GetEffectiveAddress, () => '');
    },
    getPairingToken() {
      return invokeGoBinding('GetPairingToken', GetPairingToken, () => '');
    },
    getSyncingAnimeItems() {
      return invokeGoBinding('GetSyncingAnimeItems', GetSyncingAnimeItems, () => []);
    },
    getAnimes() {
      return invokeGoBinding('GetAnimes', GetAnimes, () => []);
    },
    getAnimeDetail(id) {
      return invokeGoBinding('GetAnimeDetail', () => GetAnimeDetail(id), () => null);
    },
    getAnimeHistory() {
      return invokeGoBinding('GetAnimeHistory', GetAnimeHistory, () => []);
    },
    getChapterSchedule(day) {
      return invokeGoBinding('GetChapterSchedule', () => GetChapterSchedule(day), () => []);
    },
    getAnimeCover(animeID) {
      return invokeGoBinding('GetAnimeCover', () => GetAnimeCover(animeID), () => ({ source: 'placeholder' }));
    },
    getChapterDayCounts() {
      return invokeGoBinding('GetChapterDayCounts', GetChapterDayCounts, () => []);
    },
    adjustWatchedChapters(animeID, delta, base) {
      return invokeGoBinding('AdjustWatchedChapters', () => AdjustWatchedChapters(animeID, delta, base), () => RUNTIME_UNAVAILABLE_COMMAND_RESULT);
    },
    setAnimeState(animeID, estado, base) {
      return invokeGoBinding('SetAnimeState', () => SetAnimeState(animeID, estado, base), () => RUNTIME_UNAVAILABLE_COMMAND_RESULT);
    },
    softDeleteAnime(animeID, base) {
      return invokeGoBinding('SoftDeleteAnime', () => SoftDeleteAnime(animeID, base), () => RUNTIME_UNAVAILABLE_COMMAND_RESULT);
    },
    restoreAnime(animeID, base) {
      return invokeGoBinding('RestoreAnime', () => RestoreAnime(animeID, base), () => RUNTIME_UNAVAILABLE_COMMAND_RESULT);
    },
    repeatAnime(animeID, base) {
      return invokeGoBinding('RepeatAnime', () => RepeatAnime(animeID, base), () => RUNTIME_UNAVAILABLE_COMMAND_RESULT);
    },
    openAnimePage(animeID) {
      return invokeGoBinding('OpenAnimePage', () => OpenAnimePage(animeID), () => RUNTIME_UNAVAILABLE_COMMAND_RESULT);
    },
    copyAnimePage(animeID) {
      return invokeGoBinding('CopyAnimePage', () => CopyAnimePage(animeID), () => RUNTIME_UNAVAILABLE_COMMAND_RESULT);
    },
    openAnimeFolder(animeID) {
      return invokeGoBinding('OpenAnimeFolder', () => OpenAnimeFolder(animeID), () => RUNTIME_UNAVAILABLE_COMMAND_RESULT);
    },
    copyAnimeFolder(animeID) {
      return invokeGoBinding('CopyAnimeFolder', () => CopyAnimeFolder(animeID), () => RUNTIME_UNAVAILABLE_COMMAND_RESULT);
    },
    getConnectedDevices() {
      return invokeGoBinding('GetConnectedDevices', GetConnectedDevices, () => []);
    },
    pullAnimesFromLegacy() {
      return invokeGoBinding('PullAnimesFromLegacy', PullAnimesFromLegacy, () => RUNTIME_UNAVAILABLE_PULL_RESULT).then(toAnimeLegacyPullResult);
    },
    triggerReconcile() {
      return invokeGoBinding('TriggerReconcile', TriggerReconcile, () => 'runtime unavailable');
    },
    unpairDevice(deviceID) {
      return invokeGoBinding('UnpairDevice', () => UnpairDevice(deviceID), () => 'runtime unavailable');
    },
    onPairingTokenConsumed(listener) {
      return pairingTokenSubscription.subscribe(listener);
    },
  };

  return BRIDGE_RUNTIME_SOURCE_STATE.sharedSource;
}

/** Shared bridge source singleton used across feature hooks and stores. */
export const bridgeRuntimeSource = createBridgeRuntimeSource();
