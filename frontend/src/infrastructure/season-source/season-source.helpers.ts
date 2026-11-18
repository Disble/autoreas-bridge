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
  GetSeasonOrderingBoard,
  GetSeasonOrderingSnapshot,
  ListSeasons,
  RecheckSeasonAvailability,
  ReconcileSeasonIntake,
  ReopenSeasonOrdering,
  ResolveSeasonMatch,
  RestoreSeasonName,
  RunSeasonMatching,
  SaveSeasonOrderingDraft,
  SearchSeasonProviders,
  SendSeasonAnimesToVerHoy,
  SetSeasonConsideration,
  SetSeasonGrade,
  SetSeasonAnimeMetadata,
  SetSeasonMinApprovalGrade,
  SetSeasonSlots,
  SkipSeasonGrading,
  TriggerSeasonDownloads,
} from '../../../wailsjs/go/desktop/App';
import { EventsOn } from '../../../wailsjs/runtime/runtime';
import {
  SEASON_COMMAND_OK,
  SEASON_MATCHING_FINISHED_EVENT_NAME,
  SEASON_MATCHING_PHASE_AVAILABILITY_CHECK,
  SEASON_MATCHING_PHASE_MATCHING,
  SEASON_MATCHING_PROGRESS_EVENT_NAME,
  SEASON_MATCHING_STARTED_EVENT_NAME,
  SEASON_RUNTIME_UNAVAILABLE,
  SEASON_SOURCE_STATE,
} from './season-source.constants';
import type {
  ApplyScheduleResult,
  ConfirmSelectionResult,
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
 * Calls a season binding for a query or a mutation: its rejection becomes a
 * `BridgeError`, and a binding that never attaches rejects as `unavailable`, so
 * the caller reports loading or failure instead of an empty answer or an "ok".
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
 * Creates the singleton runtime-backed season source. Its reads and outcome
 * commands reject with a `BridgeError` (`unavailable` while the module starts
 * or the binding never attaches); its status commands answer `'ok'` or the
 * failure's message.
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
    setSeasonAnimeMetadata(rowId: string, metadataJSON: string) {
      return invokeSeasonCommand('SetSeasonAnimeMetadata', () => SetSeasonAnimeMetadata(rowId, metadataJSON));
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
    discardName(rowId: string) {
      return invokeSeasonCommand('DiscardSeasonName', () => DiscardSeasonName(rowId));
    },
    restoreName(rowId: string) {
      return invokeSeasonCommand('RestoreSeasonName', () => RestoreSeasonName(rowId));
    },
    sendToVerHoy(animeIds: readonly string[]) {
      return callSeasonQuery<SendToVerHoyResult>('SendSeasonAnimesToVerHoy', () => SendSeasonAnimesToVerHoy([...animeIds]));
    },
    triggerSeasonDownloads() {
      return callSeasonQuery('TriggerSeasonDownloads', () => TriggerSeasonDownloads());
    },
    downloadSeasonAnimes(animeIds: readonly string[]) {
      return callSeasonQuery('DownloadSeasonAnimes', () => DownloadSeasonAnimes([...animeIds]));
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
      return callSeasonQuery<ConfirmSelectionResult>('ConfirmSeasonSelection', ConfirmSeasonSelection);
    },
    createSeasonAnimes(
      rowIds: readonly string[],
      folders: Readonly<Record<string, string>>,
      metadata: Readonly<Record<string, SeasonCreateMetadata>>,
    ) {
      return invokeSeasonCommand('CreateSeasonAnimes', () => CreateSeasonAnimes([...rowIds], { ...folders }, { ...metadata }));
    },
    saveOrderingDraft(draftJson: string) {
      return invokeSeasonCommand('SaveSeasonOrderingDraft', () => SaveSeasonOrderingDraft(draftJson));
    },
    applySchedule() {
      return callSeasonQuery<ApplyScheduleResult>('ApplySeasonSchedule', ApplySeasonSchedule);
    },
    reopenOrdering() {
      return invokeSeasonCommand('ReopenSeasonOrdering', ReopenSeasonOrdering);
    },
    recheckAvailability() {
      return invokeSeasonCommand('RecheckSeasonAvailability', RecheckSeasonAvailability);
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
