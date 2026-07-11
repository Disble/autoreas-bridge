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
import type {
  SeasonAnimeRow,
  SeasonSnapshot,
  SeasonSource,
} from './season-source.types';
import { hasGoBinding, waitForBindings } from '../wails-bindings.helpers';

/**
 * Creates the singleton runtime-backed season source with browser-safe degraded fallbacks.
 */
export function createSeasonSource(): SeasonSource {
  if (SEASON_SOURCE_STATE.sharedSource !== null) {
    return SEASON_SOURCE_STATE.sharedSource;
  }

  SEASON_SOURCE_STATE.sharedSource = {
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
    listSeasons() {
      return waitForBindings(() => hasGoBinding('ListSeasons')).then((isReady) => {
        return isReady ? (ListSeasons() as Promise<readonly SeasonSnapshot[]>) : Promise.resolve([]);
      });
    },
    getPastSeason(seasonId: string) {
      return waitForBindings(() => hasGoBinding('GetPastSeason')).then((isReady) => {
        return isReady ? (GetPastSeason(seasonId) as Promise<SeasonSnapshot | null>) : Promise.resolve(null);
      });
    },
    getPastSeasonAnimes(seasonId: string) {
      return waitForBindings(() => hasGoBinding('GetPastSeasonAnimes')).then((isReady) => {
        return isReady ? (GetPastSeasonAnimes(seasonId) as Promise<readonly SeasonAnimeRow[]>) : Promise.resolve([]);
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

        return SetAnimeDays(animeId, [...dias], 0).then((result) => result.status === 'ok' ? 'ok' : result.message || 'Failed to move anime');
      });
    },
    sendToVerHoy(animeIds: readonly string[]) {
      return waitForBindings(() => hasGoBinding('SendSeasonAnimesToVerHoy')).then((isReady) => {
        return isReady ? SendSeasonAnimesToVerHoy([...animeIds]) : Promise.resolve(SEASON_SEND_UNAVAILABLE);
      });
    },
    triggerSeasonDownloads() {
      return waitForBindings(() => hasGoBinding('TriggerSeasonDownloads')).then((isReady) => {
        return isReady ? TriggerSeasonDownloads() : Promise.resolve(SEASON_RUNTIME_UNAVAILABLE);
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
    setConsideration(rowId: string, consideration: string) {
      return waitForBindings(() => hasGoBinding('SetSeasonConsideration')).then((isReady) => {
        return isReady ? SetSeasonConsideration(rowId, consideration) : Promise.resolve(SEASON_RUNTIME_UNAVAILABLE);
      });
    },
    confirmSelection() {
      return waitForBindings(() => hasGoBinding('ConfirmSeasonSelection')).then((isReady) => {
        return isReady ? ConfirmSeasonSelection() : Promise.resolve(SEASON_CONFIRM_UNAVAILABLE);
      });
    },
    createSeasonAnimes(rowIds: readonly string[], folders: Readonly<Record<string, string>>) {
      return waitForBindings(() => hasGoBinding('CreateSeasonAnimes')).then((isReady) => {
        return isReady ? CreateSeasonAnimes([...rowIds], { ...folders }) : Promise.resolve(SEASON_RUNTIME_UNAVAILABLE);
      });
    },
    pickFolder(title: string) {
      return waitForBindings(() => hasGoBinding('PickFolder')).then((isReady) => {
        return isReady ? (PickFolder(title) as Promise<string>) : Promise.resolve('');
      });
    },
    getOrderingBoard() {
      return waitForBindings(() => hasGoBinding('GetSeasonOrderingBoard')).then((isReady) => {
        return isReady ? GetSeasonOrderingBoard() : Promise.resolve(SEASON_EMPTY_BOARD);
      });
    },
    saveOrderingDraft(draftJson: string) {
      return waitForBindings(() => hasGoBinding('SaveSeasonOrderingDraft')).then((isReady) => {
        return isReady ? SaveSeasonOrderingDraft(draftJson) : Promise.resolve(SEASON_RUNTIME_UNAVAILABLE);
      });
    },
    applySchedule() {
      return waitForBindings(() => hasGoBinding('ApplySeasonSchedule')).then((isReady) => {
        return isReady ? ApplySeasonSchedule() : Promise.resolve(SEASON_APPLY_UNAVAILABLE);
      });
    },
    reopenOrdering() {
      return waitForBindings(() => hasGoBinding('ReopenSeasonOrdering')).then((isReady) => {
        return isReady ? ReopenSeasonOrdering() : Promise.resolve(SEASON_RUNTIME_UNAVAILABLE);
      });
    },
    recheckAvailability() {
      return waitForBindings(() => hasGoBinding('RecheckSeasonAvailability')).then((isReady) => {
        return isReady ? RecheckSeasonAvailability() : Promise.resolve(SEASON_RUNTIME_UNAVAILABLE);
      });
    },
  };

  return SEASON_SOURCE_STATE.sharedSource;
}

/** Shared season source singleton used across season hooks and stores. */
export const seasonSource = createSeasonSource();
