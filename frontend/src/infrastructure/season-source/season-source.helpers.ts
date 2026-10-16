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
  GetSeasonCheckTime,
  GetSeasonOrderingBoard,
  GetSeasonOrderingSnapshot,
  ListSeasons,
  PickFolder,
  RecheckSeasonAvailability,
  ReconcileSeasonIntake,
  ReopenSeasonOrdering,
  ResolveSeasonMatch,
  RunSeasonMatching,
  SaveSeasonOrderingDraft,
  SearchSeasonProviders,
  SendSeasonAnimesToVerHoy,
  SetAnimeDays,
  SetSeasonConsideration,
  SetSeasonGrade,
  SetSeasonAnimeMetadata,
  SetSeasonCheckTime,
  SetSeasonMinApprovalGrade,
  SetSeasonSlots,
  SkipSeasonGrading,
  TriggerSeasonDownloads,
} from '../../../wailsjs/go/desktop/App';
import { EventsOn } from '../../../wailsjs/runtime/runtime';
import {
  SEASON_APPLY_UNAVAILABLE,
  SEASON_CONFIRM_UNAVAILABLE,
  SEASON_EMPTY_BOARD,
  SEASON_MATCHING_FINISHED_EVENT_NAME,
  SEASON_MATCHING_PHASE_AVAILABILITY_CHECK,
  SEASON_MATCHING_PHASE_MATCHING,
  SEASON_MATCHING_PROGRESS_EVENT_NAME,
  SEASON_MATCHING_STARTED_EVENT_NAME,
  SEASON_PROVIDER_SEARCH_UNAVAILABLE,
  SEASON_RUNTIME_UNAVAILABLE,
  SEASON_SEND_UNAVAILABLE,
  SEASON_SOURCE_STATE,
} from './season-source.constants';
import type {
  SeasonCreateMetadata,
  SeasonMatchingFinishedNotice,
  SeasonMatchingFinishedWire,
  SeasonMatchingPhase,
  SeasonMatchingProgressCandidate,
  SeasonMatchingProgressNotice,
  SeasonMatchingProgressWire,
  SeasonMatchingStartedNotice,
  SeasonMatchingStartedWire,
  SeasonOrderingSnapshot,
  SeasonProviderSearchResult,
  SeasonSource,
} from './season-source.types';
import { createRuntimeSubscription, hasGoBinding, invokeGoBinding, waitForBindings } from '../wails-bindings.helpers';

/**
 * Narrows a backend matching phase onto the closed frontend union, throwing
 * on an unknown one rather than widening the union silently. The panel names
 * its progress after this phase, so an unknown value must surface instead of
 * letting the screen claim to be matching while it is really checking.
 */
function mapSeasonMatchingPhase(phase: string): SeasonMatchingPhase {
  switch (phase) {
    case SEASON_MATCHING_PHASE_MATCHING:
    case SEASON_MATCHING_PHASE_AVAILABILITY_CHECK:
      return phase;
    default:
      throw new Error(`Unknown season matching phase: ${phase}`);
  }
}

/** Maps the started wire payload onto the run total the panel counts against. */
function mapSeasonMatchingStartedNotice(wire: SeasonMatchingStartedWire): SeasonMatchingStartedNotice {
  return { seasonId: wire.SeasonID, total: wire.Total };
}

/**
 * Maps one wire progress row onto the patched-row shape the store applies. A
 * null candidate list (the Go nil slice for a row that retained none) reads
 * as empty so the row still patches.
 */
function mapSeasonMatchingProgressNotice(wire: SeasonMatchingProgressWire): SeasonMatchingProgressNotice {
  return {
    seasonId: wire.SeasonID,
    phase: mapSeasonMatchingPhase(wire.Phase),
    rowId: wire.RowID,
    rawName: wire.RawName,
    matchStatus: wire.MatchStatus,
    matchedSlug: wire.MatchedSlug,
    candidates: (wire.Candidates ?? []).map((candidate) => ({
      title: candidate.Title,
      pageUrl: candidate.PageURL,
      score: candidate.Score,
    })),
    availability: wire.Availability,
    availableEpisodes: wire.AvailableEpisodes,
  };
}

/** Maps the finished wire payload onto the run's terminal signal. */
function mapSeasonMatchingFinishedNotice(wire: SeasonMatchingFinishedWire): SeasonMatchingFinishedNotice {
  return { seasonId: wire.SeasonID };
}

/**
 * Creates the singleton runtime-backed season source with browser-safe degraded fallbacks.
 */
export function createSeasonSource(): SeasonSource {
  if (SEASON_SOURCE_STATE.sharedSource !== null) {
    return SEASON_SOURCE_STATE.sharedSource;
  }

  const matchingStartedSubscription = createRuntimeSubscription<SeasonMatchingStartedNotice>((emit) => {
    return EventsOn(SEASON_MATCHING_STARTED_EVENT_NAME, (wire: SeasonMatchingStartedWire) => emit(mapSeasonMatchingStartedNotice(wire)));
  });

  const matchingProgressSubscription = createRuntimeSubscription<SeasonMatchingProgressNotice>((emit) => {
    return EventsOn(SEASON_MATCHING_PROGRESS_EVENT_NAME, (wire: SeasonMatchingProgressWire) => emit(mapSeasonMatchingProgressNotice(wire)));
  });

  const matchingFinishedSubscription = createRuntimeSubscription<SeasonMatchingFinishedNotice>((emit) => {
    return EventsOn(SEASON_MATCHING_FINISHED_EVENT_NAME, (wire: SeasonMatchingFinishedWire) => emit(mapSeasonMatchingFinishedNotice(wire)));
  });

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
    setSeasonAnimeMetadata(rowId: string, metadataJSON: string) {
      return invokeGoBinding(
        'SetSeasonAnimeMetadata',
        () => SetSeasonAnimeMetadata(rowId, metadataJSON),
        () => SEASON_RUNTIME_UNAVAILABLE,
      );
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
    searchProviders(query: string) {
      return invokeGoBinding<SeasonProviderSearchResult>(
        'SearchSeasonProviders',
        () => SearchSeasonProviders(query),
        () => SEASON_PROVIDER_SEARCH_UNAVAILABLE,
      );
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
    createSeasonAnimes(
      rowIds: readonly string[],
      folders: Readonly<Record<string, string>>,
      metadata: Readonly<Record<string, SeasonCreateMetadata>>,
    ) {
      return invokeGoBinding(
        'CreateSeasonAnimes',
        () => CreateSeasonAnimes([...rowIds], { ...folders }, { ...metadata }),
        () => SEASON_RUNTIME_UNAVAILABLE,
      );
    },
    pickFolder(title: string) {
      return invokeGoBinding('PickFolder', () => PickFolder(title), () => '');
    },
    getOrderingBoard() {
      return invokeGoBinding('GetSeasonOrderingBoard', GetSeasonOrderingBoard, () => SEASON_EMPTY_BOARD);
    },
    getSeasonOrderingSnapshot(seasonId: string) {
      return invokeGoBinding<SeasonOrderingSnapshot>('GetSeasonOrderingSnapshot', () => GetSeasonOrderingSnapshot(seasonId), () => ({ recorded: false, rail: [], grid: [] }));
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
    getCheckTime() {
      return invokeGoBinding('GetSeasonCheckTime', GetSeasonCheckTime, () => '');
    },
    setCheckTime(hhmm: string) {
      return invokeGoBinding('SetSeasonCheckTime', () => SetSeasonCheckTime(hhmm), () => SEASON_RUNTIME_UNAVAILABLE);
    },
    subscribeMatchingStarted(listener) {
      return matchingStartedSubscription.subscribe(listener);
    },
    subscribeMatchingProgress(listener) {
      return matchingProgressSubscription.subscribe(listener);
    },
    subscribeMatchingFinished(listener) {
      return matchingFinishedSubscription.subscribe(listener);
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
export const seasonSource = createSeasonSource(); // eslint-disable-line dharness/role-file-shape
