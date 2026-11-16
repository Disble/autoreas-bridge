import {
  ApplySeasonSchedule,
  CloseSeason,
  ConfirmSeasonSelection,
  CreateSeason,
  CreateSeasonAnimes,
  DiscardSeasonName,
  DownloadSeasonAnimes,
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
  RestoreSeasonName,
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
  SEASON_COMMAND_OK,
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
  SeasonAnimeRow,
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
  SeasonQuerySource,
  SeasonSnapshot,
  SeasonSource,
  SendToVerHoyResult,
} from '../../shared/contracts/season.types';
import { openInDefaultBrowser } from '../../shared/helpers/url.helpers';
import { createBridgeError } from '../../shared/query/bridge-error/bridge-error.helpers';
import { withBridgeErrors } from '../bridge-error/bridge-error.helpers';
import { createRuntimeSubscription, invokeGoBinding } from '../wails-bindings.helpers';

/**
 * Calls a season command binding, which returns only an error since the season
 * module handle, and answers the status string its consumers still read:
 * `'ok'` once it resolves, the failure's message once it rejects (a module
 * still starting or failed included), and the runtime-unavailable sentinel when
 * the binding never attaches.
 */
function invokeSeasonCommand(bindingName: string, invoke: () => Promise<void>): Promise<string> {
  return invokeGoBinding(
    bindingName,
    () => withBridgeErrors(invoke()).then(() => SEASON_COMMAND_OK, (error: Error) => error.message),
    () => SEASON_RUNTIME_UNAVAILABLE,
  );
}

/**
 * Calls a season read binding and maps its rejection back to the fallback its
 * consumers still read as "nothing yet", which is what the binding answered
 * before it returned an error.
 */
function invokeSeasonRead<T>(bindingName: string, invoke: () => Promise<T>, fallback: () => T): Promise<T> {
  return invokeGoBinding(bindingName, () => withBridgeErrors(invoke()).catch(fallback), fallback);
}

/**
 * Calls a season read binding for a query: its rejection becomes a
 * `BridgeError`, and a binding that never attaches rejects as `unavailable`, so
 * the query reports loading or failure instead of an empty answer.
 * @param bindingName The `App` method name, as `window.go` exposes it.
 * @param call The generated binding call.
 * @returns What the binding answered.
 */
function callSeasonQuery<T>(bindingName: string, call: () => Promise<T>): Promise<T> {
  return withBridgeErrors(
    invokeGoBinding(bindingName, call, () => Promise.reject(createBridgeError('unavailable', `the ${bindingName} binding is not attached`))),
  );
}

/**
 * Calls a season binding whose result carries a status and maps its rejection
 * back to `unavailable` carrying the failure's message as that status, which is
 * what the binding answered before it returned an error.
 */
function invokeSeasonOutcome<T extends { readonly status: string }>(bindingName: string, invoke: () => Promise<T>, unavailable: T): Promise<T> {
  return invokeGoBinding(
    bindingName,
    () => withBridgeErrors(invoke()).catch((error: Error) => ({ ...unavailable, status: error.message })),
    () => unavailable,
  );
}

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
export function createSeasonSource(): SeasonSource & SeasonQuerySource {
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
      return invokeSeasonRead('GetSeason', GetSeason, () => null);
    },
    createSeason(name: string) {
      return invokeSeasonCommand('CreateSeason', () => CreateSeason(name));
    },
    setMinApprovalGrade(grade: number) {
      return invokeSeasonCommand('SetSeasonMinApprovalGrade', () => SetSeasonMinApprovalGrade(grade));
    },
    setSlots(slots: number) {
      return invokeSeasonCommand('SetSeasonSlots', () => SetSeasonSlots(slots));
    },
    closeSeason() {
      return invokeSeasonCommand('CloseSeason', CloseSeason);
    },
    getSeasonAnimes() {
      return invokeSeasonRead('GetSeasonAnimes', GetSeasonAnimes, () => []);
    },
    setSeasonAnimeMetadata(rowId: string, metadataJSON: string) {
      return invokeSeasonCommand('SetSeasonAnimeMetadata', () => SetSeasonAnimeMetadata(rowId, metadataJSON));
    },
    listSeasons() {
      return invokeSeasonRead('ListSeasons', ListSeasons, () => []);
    },
    getPastSeason(seasonId: string) {
      return invokeSeasonRead('GetPastSeason', () => GetPastSeason(seasonId), () => null);
    },
    getPastSeasonAnimes(seasonId: string) {
      return invokeSeasonRead('GetPastSeasonAnimes', () => GetPastSeasonAnimes(seasonId), () => []);
    },
    readSeason() {
      return callSeasonQuery<SeasonSnapshot | null>('GetSeason', GetSeason);
    },
    readSeasonAnimes() {
      return callSeasonQuery<readonly SeasonAnimeRow[]>('GetSeasonAnimes', GetSeasonAnimes);
    },
    readSeasons() {
      return callSeasonQuery<readonly SeasonSnapshot[]>('ListSeasons', ListSeasons);
    },
    readPastSeason(seasonId: string) {
      return callSeasonQuery<SeasonSnapshot | null>('GetPastSeason', () => GetPastSeason(seasonId));
    },
    readPastSeasonAnimes(seasonId: string) {
      return callSeasonQuery<readonly SeasonAnimeRow[]>('GetPastSeasonAnimes', () => GetPastSeasonAnimes(seasonId));
    },
    reconcileIntake(rawText: string) {
      return invokeSeasonCommand('ReconcileSeasonIntake', () => ReconcileSeasonIntake(rawText));
    },
    runMatching() {
      return invokeSeasonCommand('RunSeasonMatching', RunSeasonMatching);
    },
    resolveMatch(rowId: string, pageUrl: string) {
      return invokeSeasonCommand('ResolveSeasonMatch', () => ResolveSeasonMatch(rowId, pageUrl));
    },
    searchProviders(query: string) {
      return invokeSeasonOutcome<SeasonProviderSearchResult>('SearchSeasonProviders', () => SearchSeasonProviders(query), SEASON_PROVIDER_SEARCH_UNAVAILABLE);
    },
    discardName(rowId: string) {
      return invokeSeasonCommand('DiscardSeasonName', () => DiscardSeasonName(rowId));
    },
    restoreName(rowId: string) {
      return invokeSeasonCommand('RestoreSeasonName', () => RestoreSeasonName(rowId));
    },
    setAnimeDays(animeId: string, dias: readonly string[]) {
      // The binding is an episodes module command that rejects on failure; the season store reads
      // 'ok', the failure's message, or 'Failed to move anime' for a failure without one.
      return invokeSeasonCommand('SetAnimeDays', () => SetAnimeDays(animeId, [...dias], 0).then(() => undefined))
        .then((status) => status || 'Failed to move anime');
    },
    sendToVerHoy(animeIds: readonly string[]) {
      // The episodes module answers only the download window and rejects on failure; the season
      // store reads the status 'ok' beside it, or the failure's message as the status.
      return invokeSeasonOutcome<SendToVerHoyResult>(
        'SendSeasonAnimesToVerHoy',
        () => SendSeasonAnimesToVerHoy([...animeIds]).then((result) => ({ status: SEASON_COMMAND_OK, pastDownloadTime: result.pastDownloadTime, downloadTime: result.downloadTime })),
        SEASON_SEND_UNAVAILABLE,
      );
    },
    triggerSeasonDownloads() {
      return invokeGoBinding('TriggerSeasonDownloads', TriggerSeasonDownloads, () => SEASON_RUNTIME_UNAVAILABLE);
    },
    downloadSeasonAnimes(animeIds: readonly string[]) {
      return invokeGoBinding('DownloadSeasonAnimes', () => DownloadSeasonAnimes([...animeIds]), () => SEASON_RUNTIME_UNAVAILABLE);
    },
    setGrade(animeId: string, grade: number) {
      return invokeSeasonCommand('SetSeasonGrade', () => SetSeasonGrade(animeId, grade));
    },
    skipGrading(rowId: string) {
      return invokeSeasonCommand('SkipSeasonGrading', () => SkipSeasonGrading(rowId));
    },
    setConsideration(rowId: string, consideration: string) {
      return invokeSeasonCommand('SetSeasonConsideration', () => SetSeasonConsideration(rowId, consideration));
    },
    confirmSelection() {
      return invokeSeasonOutcome('ConfirmSeasonSelection', ConfirmSeasonSelection, SEASON_CONFIRM_UNAVAILABLE);
    },
    createSeasonAnimes(
      rowIds: readonly string[],
      folders: Readonly<Record<string, string>>,
      metadata: Readonly<Record<string, SeasonCreateMetadata>>,
    ) {
      return invokeSeasonCommand('CreateSeasonAnimes', () => CreateSeasonAnimes([...rowIds], { ...folders }, { ...metadata }));
    },
    pickFolder(title: string) {
      // A failed dialog rejects as internal since the shell slice; its pickers still read it as a cancel.
      return invokeGoBinding('PickFolder', () => PickFolder(title), () => '').catch(() => '');
    },
    getOrderingBoard() {
      return invokeSeasonRead('GetSeasonOrderingBoard', GetSeasonOrderingBoard, () => SEASON_EMPTY_BOARD);
    },
    saveOrderingDraft(draftJson: string) {
      return invokeSeasonCommand('SaveSeasonOrderingDraft', () => SaveSeasonOrderingDraft(draftJson));
    },
    applySchedule() {
      return invokeSeasonOutcome('ApplySeasonSchedule', ApplySeasonSchedule, SEASON_APPLY_UNAVAILABLE);
    },
    reopenOrdering() {
      return invokeSeasonCommand('ReopenSeasonOrdering', ReopenSeasonOrdering);
    },
    recheckAvailability() {
      return invokeSeasonCommand('RecheckSeasonAvailability', RecheckSeasonAvailability);
    },
    getCheckTime() {
      return invokeGoBinding('GetSeasonCheckTime', GetSeasonCheckTime, () => '');
    },
    setCheckTime(hhmm: string) {
      // The binding moved to the settings module and rejects on failure; the intake check time
      // still reads the old status string ('ok' or the failure message) until its own slice migrates it.
      return invokeGoBinding(
        'SetSeasonCheckTime',
        () => withBridgeErrors(SetSeasonCheckTime(hhmm)).then(() => 'ok', (error: Error) => error.message),
        () => SEASON_RUNTIME_UNAVAILABLE,
      );
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
      openInDefaultBrowser(url); // a blank url means no matched slug
    },
    fetchOrderingBoard() {
      return withBridgeErrors(
        invokeGoBinding('GetSeasonOrderingBoard', GetSeasonOrderingBoard, () =>
          Promise.reject(createBridgeError('unavailable', 'the GetSeasonOrderingBoard binding is not attached')),
        ),
      );
    },
    fetchSeasonOrderingSnapshot(seasonId: string) {
      return withBridgeErrors<SeasonOrderingSnapshot>(
        invokeGoBinding('GetSeasonOrderingSnapshot', () => GetSeasonOrderingSnapshot(seasonId), () =>
          Promise.reject(createBridgeError('unavailable', 'the GetSeasonOrderingSnapshot binding is not attached')),
        ),
      );
    },
    fetchProviderSearch(query: string) {
      return withBridgeErrors<SeasonProviderSearchResult>(
        invokeGoBinding('SearchSeasonProviders', () => SearchSeasonProviders(query), () =>
          Promise.reject(createBridgeError('unavailable', 'the SearchSeasonProviders binding is not attached')),
        ),
      );
    },
  };

  return SEASON_SOURCE_STATE.sharedSource;
}

/** Shared season source singleton used across season hooks and stores. */
export const seasonSource = createSeasonSource(); // eslint-disable-line dharness/role-file-shape
