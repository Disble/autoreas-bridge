import type { desktop as wailsDesktop } from '../../../wailsjs/go/models';
import type { EpisodeDurationRowSource, EpisodeReanalysisResult, EpisodeReanalysisStatus, EpisodeDurationRuntimeSource } from './episode-duration-runtime-source.types';

/** Event a running re-analysis emits before each file it measures. */
export const EPISODE_REANALYSIS_PROGRESS_EVENT_NAME = 'episode.durations_reanalysis_progress';

/** Fail-closed section served when the Go bindings are unreachable. */
export const RUNTIME_UNAVAILABLE_EPISODE_SECTION = {
  outcome: 'error',
  message: 'runtime unavailable',
  folderStatus: 'none',
  rows: [],
  beyondTotal: [],
  tv: false,
} as unknown as wailsDesktop.EpisodeDurationSectionResult;

/** Fail-closed review served when the Go bindings are unreachable. */
export const RUNTIME_UNAVAILABLE_EPISODE_REVIEW = {
  outcome: 'error',
  message: 'runtime unavailable',
  status: 'ok',
  filesRecognized: 0,
  rows: [],
} as unknown as wailsDesktop.EpisodeDurationReviewResult;

/** Every row source the section can carry; anything else reads as not measured. */
export const EPISODE_DURATION_ROW_SOURCES: readonly EpisodeDurationRowSource[] = [
  'measured',
  'manual',
  'manual_no_file',
  // Stryker disable next-line StringLiteral: equivalent: `narrow` maps an unknown source to 'not_measured', so leaving it out of this list still reads it as itself.
  'not_measured',
  'not_measured_file_found',
];

/** Every review status; anything else reads as `ok`, which only shows what the rows say. */
export const EPISODE_REANALYSIS_STATUSES: readonly EpisodeReanalysisStatus[] = ['ok', 'no_folder', 'folder_missing', 'no_files', 'probe_unavailable', 'interrupted', 'cancelled'];

/** Every review row result; anything else reads as `skipped`, which never becomes a draft edit. */
export const EPISODE_REANALYSIS_RESULTS: readonly EpisodeReanalysisResult[] = [
  'unchanged',
  'update',
  'add',
  'manual_kept',
  // Stryker disable next-line StringLiteral: equivalent: `narrow` maps an unknown result to 'skipped', so leaving it out of this list still reads it as itself.
  'skipped',
  'unreadable',
  'not_reached',
];

/** Module-local singleton container for the shared episode-duration source. */
export const EPISODE_DURATION_RUNTIME_SOURCE_STATE: { sharedSource: EpisodeDurationRuntimeSource | null } = {
  sharedSource: null,
};
