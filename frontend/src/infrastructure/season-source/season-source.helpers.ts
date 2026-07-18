import {
  ApplySeasonSchedule,
  CloseSeason,
  ConfirmSeasonSelection,
  CreateSeason,
  CreateSeasonAnimes,
  DiscardSeasonName,
  GetPastSeason,
  GetPastSeasonAnimes,
  GetSeason,
  GetSeasonAnimes,
  GetSeasonOrderingBoard,
  ListSeasons,
  PickFolder,
  RecheckSeasonAvailability,
  ReconcileSeasonIntake,
  ReopenSeasonOrdering,
  ResolveSeasonMatch,
  RunSeasonMatching,
  SaveSeasonOrderingDraft,
  SendSeasonAnimesToVerHoy,
  SetAnimeDays,
  SetSeasonConsideration,
  SetSeasonGrade,
  SetSeasonMinApprovalGrade,
  SetSeasonSlots,
  SkipSeasonGrading,
  TriggerSeasonDownloads,
} from '../../../wailsjs/go/main/App';
import {
  SEASON_APPLY_UNAVAILABLE,
  SEASON_CONFIRM_UNAVAILABLE,
  SEASON_EMPTY_BOARD,
  SEASON_RUNTIME_UNAVAILABLE,
  SEASON_SEND_UNAVAILABLE,
  SEASON_SOURCE_STATE,
} from './season-source.constants';
import type { SeasonSource } from './season-source.types';
import { hasGoBinding, invokeGoBinding, waitForBindings } from '../wails-bindings.helpers';

/**
 * Creates the singleton runtime-backed season source with browser-safe degraded fallbacks.
 */
export function createSeasonSource(): SeasonSource {
  if (SEASON_SOURCE_STATE.sharedSource !== null) {
    return SEASON_SOURCE_STATE.sharedSource;
  }

  SEASON_SOURCE_STATE.sharedSource = {
    getSeason() {
      return invokeGoBinding('GetSeason', GetSeason, () => null);
    },
    createSeason(name: string) {
      return invokeGoBinding('CreateSeason', () => CreateSeason(name), () => SEASON_RUNTIME_UNAVAILABLE);
    },
    setMinApprovalGrade(grade: number) {
      return invokeGoBinding('SetSeasonMinApprovalGrade', () => SetSeasonMinApprovalGrade(grade), () => SEASON_RUNTIME_UNAVAILABLE);
    },
    setSlots(slots: number) {
      return invokeGoBinding('SetSeasonSlots', () => SetSeasonSlots(slots), () => SEASON_RUNTIME_UNAVAILABLE);
    },
    closeSeason() {
      return invokeGoBinding('CloseSeason', CloseSeason, () => SEASON_RUNTIME_UNAVAILABLE);
    },
    getSeasonAnimes() {
      return invokeGoBinding('GetSeasonAnimes', GetSeasonAnimes, () => []);
    },
    listSeasons() {
      return invokeGoBinding('ListSeasons', ListSeasons, () => []);
    },
    getPastSeason(seasonId: string) {
      return invokeGoBinding('GetPastSeason', () => GetPastSeason(seasonId), () => null);
    },
    getPastSeasonAnimes(seasonId: string) {
      return invokeGoBinding('GetPastSeasonAnimes', () => GetPastSeasonAnimes(seasonId), () => []);
    },
    reconcileIntake(rawText: string) {
      return invokeGoBinding('ReconcileSeasonIntake', () => ReconcileSeasonIntake(rawText), () => SEASON_RUNTIME_UNAVAILABLE);
    },
    runMatching() {
      return invokeGoBinding('RunSeasonMatching', RunSeasonMatching, () => SEASON_RUNTIME_UNAVAILABLE);
    },
    resolveMatch(rowId: string, pageUrl: string) {
      return invokeGoBinding('ResolveSeasonMatch', () => ResolveSeasonMatch(rowId, pageUrl), () => SEASON_RUNTIME_UNAVAILABLE);
    },
    discardName(rowId: string) {
      return invokeGoBinding('DiscardSeasonName', () => DiscardSeasonName(rowId), () => SEASON_RUNTIME_UNAVAILABLE);
    },
    setAnimeDays(animeId: string, dias: readonly string[]) {
      return waitForBindings(() => hasGoBinding('SetAnimeDays')).then((isReady) => {
        if (!isReady) {
          return Promise.resolve(SEASON_RUNTIME_UNAVAILABLE);
        }

        return SetAnimeDays(animeId, [...dias], 0).then((result) => result.status === 'ok' ? 'ok' : result.message || 'Failed to move anime');
      });
    },
    sendToVerHoy(animeIds: readonly string[]) {
      return invokeGoBinding('SendSeasonAnimesToVerHoy', () => SendSeasonAnimesToVerHoy([...animeIds]), () => SEASON_SEND_UNAVAILABLE);
    },
    triggerSeasonDownloads() {
      return invokeGoBinding('TriggerSeasonDownloads', TriggerSeasonDownloads, () => SEASON_RUNTIME_UNAVAILABLE);
    },
    setGrade(animeId: string, grade: number) {
      return invokeGoBinding('SetSeasonGrade', () => SetSeasonGrade(animeId, grade), () => SEASON_RUNTIME_UNAVAILABLE);
    },
    skipGrading(rowId: string) {
      return invokeGoBinding('SkipSeasonGrading', () => SkipSeasonGrading(rowId), () => SEASON_RUNTIME_UNAVAILABLE);
    },
    setConsideration(rowId: string, consideration: string) {
      return invokeGoBinding('SetSeasonConsideration', () => SetSeasonConsideration(rowId, consideration), () => SEASON_RUNTIME_UNAVAILABLE);
    },
    confirmSelection() {
      return invokeGoBinding('ConfirmSeasonSelection', ConfirmSeasonSelection, () => SEASON_CONFIRM_UNAVAILABLE);
    },
    createSeasonAnimes(rowIds: readonly string[], folders: Readonly<Record<string, string>>) {
      return invokeGoBinding('CreateSeasonAnimes', () => CreateSeasonAnimes([...rowIds], { ...folders }), () => SEASON_RUNTIME_UNAVAILABLE);
    },
    pickFolder(title: string) {
      return invokeGoBinding('PickFolder', () => PickFolder(title), () => '');
    },
    getOrderingBoard() {
      return invokeGoBinding('GetSeasonOrderingBoard', GetSeasonOrderingBoard, () => SEASON_EMPTY_BOARD);
    },
    saveOrderingDraft(draftJson: string) {
      return invokeGoBinding('SaveSeasonOrderingDraft', () => SaveSeasonOrderingDraft(draftJson), () => SEASON_RUNTIME_UNAVAILABLE);
    },
    applySchedule() {
      return invokeGoBinding('ApplySeasonSchedule', ApplySeasonSchedule, () => SEASON_APPLY_UNAVAILABLE);
    },
    reopenOrdering() {
      return invokeGoBinding('ReopenSeasonOrdering', ReopenSeasonOrdering, () => SEASON_RUNTIME_UNAVAILABLE);
    },
    recheckAvailability() {
      return invokeGoBinding('RecheckSeasonAvailability', RecheckSeasonAvailability, () => SEASON_RUNTIME_UNAVAILABLE);
    },
    openPage(url: string) {
      if (url === '' || typeof window.runtime?.BrowserOpenURL !== 'function') {
        return; // no matched slug, or running outside the Wails runtime
      }
      window.runtime.BrowserOpenURL(url);
    },
  };

  return SEASON_SOURCE_STATE.sharedSource;
}

/** Shared season source singleton used across season hooks and stores. */
export const seasonSource = createSeasonSource();
