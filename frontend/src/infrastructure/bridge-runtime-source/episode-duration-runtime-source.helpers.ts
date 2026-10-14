import { CancelEpisodeReanalysis, GetEpisodeDurationSection, ReanalyzeEpisodeDurations } from '../../../wailsjs/go/desktop/App';
import type { desktop as wailsDesktop } from '../../../wailsjs/go/models';
import { EventsOn } from '../../../wailsjs/runtime/runtime';
import { createRuntimeSubscription, invokeGoBinding } from '../wails-bindings.helpers';
import {
  EPISODE_DURATION_ROW_SOURCES,
  EPISODE_DURATION_RUNTIME_SOURCE_STATE,
  EPISODE_REANALYSIS_PROGRESS_EVENT_NAME,
  EPISODE_REANALYSIS_RESULTS,
  EPISODE_REANALYSIS_STATUSES,
  RUNTIME_UNAVAILABLE_EPISODE_REVIEW,
  RUNTIME_UNAVAILABLE_EPISODE_SECTION,
} from './episode-duration-runtime-source.constants';
import type {
  EpisodeDurationFolderStatus,
  EpisodeDurationRequest,
  EpisodeDurationRow,
  EpisodeDurationRuntimeSource,
  EpisodeDurationSection,
  EpisodeReanalysisProgress,
  EpisodeReanalysisReview,
  EpisodeReanalysisRow,
} from './episode-duration-runtime-source.types';

/**
 * Narrows one wire string to a known member, or to the fallback when the
 * backend sends a value this frontend does not know yet.
 */
function narrow<T extends string>(value: string, known: readonly T[], fallback: T): T {
  return (known as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Narrows the folder status; an unknown one is treated as no folder, which disables re-analysis. */
function toFolderStatus(status: string): EpisodeDurationFolderStatus {
  return status === 'missing' || status === 'found' ? status : 'none';
}

/** Maps one section row, reading an unknown source as not measured. */
function toSectionRow(row: wailsDesktop.EpisodeDurationRowDTO): EpisodeDurationRow {
  return {
    episode: row.episode,
    durationMs: row.durationMs,
    minutes: row.minutes,
    long: row.long,
    source: narrow(row.source, EPISODE_DURATION_ROW_SOURCES, 'not_measured'),
  };
}

/** Maps the section; an unknown outcome is a failure, and missing lists are empty, never null. */
function toSection(result: wailsDesktop.EpisodeDurationSectionResult): EpisodeDurationSection {
  return {
    outcome: result.outcome === 'ok' ? 'ok' : 'error',
    ...(result.message === undefined ? {} : { message: result.message }),
    folderStatus: toFolderStatus(result.folderStatus),
    rows: (result.rows ?? []).map(toSectionRow),
    beyondTotal: result.beyondTotal ?? [],
    tv: result.tv,
  };
}

/** Maps one review row, reading an unknown result as skipped so it can never become an edit. */
function toReviewRow(row: wailsDesktop.EpisodeDurationReviewRowDTO): EpisodeReanalysisRow {
  return {
    episode: row.episode,
    basename: row.basename,
    currentMs: row.currentMs,
    currentMinutes: row.currentMinutes,
    currentSource: row.currentSource,
    measuredMs: row.measuredMs,
    measuredMinutes: row.measuredMinutes,
    result: narrow(row.result, EPISODE_REANALYSIS_RESULTS, 'skipped'),
    ...(row.detail === undefined ? {} : { detail: row.detail }),
  };
}

/** Maps the review; an unknown outcome is an error, so a new backend outcome degrades loudly. */
function toReview(result: wailsDesktop.EpisodeDurationReviewResult): EpisodeReanalysisReview {
  return {
    outcome: result.outcome === 'ok' || result.outcome === 'busy' ? result.outcome : 'error',
    ...(result.message === undefined ? {} : { message: result.message }),
    status: narrow(result.status, EPISODE_REANALYSIS_STATUSES, 'ok'),
    filesRecognized: result.filesRecognized,
    rows: (result.rows ?? []).map(toReviewRow),
  };
}

/** Converts the draft's view of the anime into its wire DTO. */
function toRequestDTO(request: EpisodeDurationRequest): wailsDesktop.EpisodeDurationAnimeDTO {
  return { ...request } as wailsDesktop.EpisodeDurationAnimeDTO;
}

/**
 * Creates the runtime-backed episode-duration source once and returns the same
 * memoized instance on every later call, so consumers resolve it where they
 * use it instead of importing a module-level value. Every binding
 * degrades to a fail-closed result outside Wails, so the Editor shows a failure
 * instead of hanging, and the progress stream degrades to a no-op subscription.
 */
export function createEpisodeDurationRuntimeSource(): EpisodeDurationRuntimeSource {
  if (EPISODE_DURATION_RUNTIME_SOURCE_STATE.sharedSource !== null) {
    return EPISODE_DURATION_RUNTIME_SOURCE_STATE.sharedSource;
  }

  const progressSubscription = createRuntimeSubscription<EpisodeReanalysisProgress>((emit) => {
    return EventsOn(EPISODE_REANALYSIS_PROGRESS_EVENT_NAME, (progress: EpisodeReanalysisProgress) => emit(progress));
  });

  EPISODE_DURATION_RUNTIME_SOURCE_STATE.sharedSource = {
    getEpisodeDurationSection(request) {
      return invokeGoBinding('GetEpisodeDurationSection', () => GetEpisodeDurationSection(toRequestDTO(request)), () => RUNTIME_UNAVAILABLE_EPISODE_SECTION).then(toSection);
    },
    reanalyzeEpisodeDurations(request) {
      return invokeGoBinding('ReanalyzeEpisodeDurations', () => ReanalyzeEpisodeDurations(toRequestDTO(request)), () => RUNTIME_UNAVAILABLE_EPISODE_REVIEW).then(toReview);
    },
    cancelEpisodeReanalysis() {
      return invokeGoBinding('CancelEpisodeReanalysis', CancelEpisodeReanalysis, () => undefined);
    },
    onEpisodeReanalysisProgress(listener) {
      return progressSubscription.subscribe(listener);
    },
  };

  return EPISODE_DURATION_RUNTIME_SOURCE_STATE.sharedSource;
}
