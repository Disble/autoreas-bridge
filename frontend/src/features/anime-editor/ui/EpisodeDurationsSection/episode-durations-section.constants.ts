import type { EpisodeDurationRowSource } from '../../../../infrastructure/bridge-runtime-source/episode-duration-runtime-source.types';
import type { EpisodeReanalysisReview } from '../../../../infrastructure/bridge-runtime-source/episode-duration-runtime-source.types';
import type { EpisodeAnalysisState, EpisodeDurationsEmptyCopy, EpisodeDurationsLoad, EpisodeReanalysisResultView } from './episode-durations-section.types';

/** One minute in milliseconds: durations are stored in ms and edited in whole minutes. */
export const EPISODE_MINUTE_MS = 60_000;

/** A TV episode strictly longer than this runs long (the backend's `duration.KindLong` rule). */
export const EPISODE_LONG_THRESHOLD_MS = 30 * EPISODE_MINUTE_MS;

/**
 * How long the section waits after the draft's folder, total or type changes
 * before it asks again, so typing a folder path reads the disk once, not per key.
 */
export const EPISODE_DURATIONS_RELOAD_DELAY_MS = 250;

/** The section load before any read, and while no record is loaded. */
export const EPISODE_DURATIONS_IDLE_LOAD: EpisodeDurationsLoad = { status: 'idle' };

/** No analysis running. */
export const EPISODE_ANALYSIS_IDLE: EpisodeAnalysisState = { isRunning: false };

/** The review of a re-analysis whose binding threw; the thrown message is added to it. */
export const EPISODE_REANALYSIS_FAILED_REVIEW: EpisodeReanalysisReview = { outcome: 'error', status: 'ok', filesRecognized: 0, rows: [] };

/** Placeholder rows the table renders while the section is unresolved. */
export const EPISODE_DURATIONS_SKELETON_ROW_COUNT = 4;

/** Row height shared by the real rows and their skeletons, so the table never jumps. */
export const EPISODE_DURATIONS_ROW_CLASS = 'h-11';

/** Accessible name of the loading status region. */
export const EPISODE_DURATIONS_LOADING_LABEL = 'Loading episode durations';

/** Accessible name and visible label of the Episodes disclosure. */
export const EPISODE_DURATIONS_TITLE = 'Episodes';

/** Label of the icon-only re-analysis button; a disabled reason is appended to it. */
export const EPISODE_REANALYZE_LABEL = 'Re-analyze folder';

/** Label of the Add episode action, in the table's last row and in the empty state. */
export const EPISODE_ADD_LABEL = 'Add episode';

/** Display label of each section row source (guide section 2). */
export const EPISODE_ROW_SOURCE_LABELS: Readonly<Record<EpisodeDurationRowSource, string>> = {
  measured: 'Measured',
  manual: 'Manual',
  manual_no_file: 'Manual · no file yet',
  not_measured: 'Not measured',
  not_measured_file_found: 'Not measured · file found',
};

/** Empty-state copy by folder status (guide section 3, Panel artboard). */
export const EPISODE_DURATIONS_EMPTY_COPY: Readonly<Record<'none' | 'missing' | 'found', EpisodeDurationsEmptyCopy>> = {
  none: {
    title: 'No episode durations yet',
    description: 'Set a folder to measure episodes, or set Total episodes to list them. You can also add one duration by hand.',
  },
  missing: {
    title: 'Nothing measured for this anime',
    description: 'Durations are measured from the folder. Until it is found, you can add them by hand.',
  },
  found: {
    title: 'No episode durations yet',
    description: 'No episode file was recognized in the folder. Re-analyze after a download, or add a duration by hand.',
  },
};

/** Footer note when Total episodes is unknown. */
export const EPISODE_TOTAL_UNKNOWN_NOTE = 'The list grows as episodes are downloaded; set Total episodes to list the whole season.';

/** Footer note when the anime is not TV. */
export const EPISODE_NOT_TV_NOTE = 'Long-episode marks apply to TV series only. Durations are kept for every type.';

/** Label and chip color of each review row result (guide section 4). */
export const EPISODE_REANALYSIS_RESULT_VIEWS: Readonly<Record<string, EpisodeReanalysisResultView>> = {
  unchanged: { label: 'Unchanged', color: 'default' },
  update: { label: 'Will update', color: 'accent' },
  add: { label: 'Will add', color: 'success' },
  manual_kept: { label: 'Manual kept', color: 'warning' },
  skipped: { label: 'Skipped', color: 'default' },
  unreadable: { label: 'Unreadable', color: 'danger' },
  not_reached: { label: 'Not reached', color: 'default' },
};

/** What the review shows in "Measured now" for a file it skipped, by identity detail. */
export const EPISODE_SKIPPED_DETAIL_LABELS: Readonly<Record<string, string>> = {
  fractional: 'half episode',
  conflict: 'two files claim it',
  range: 'episode range',
  multi: 'several numbers',
  special: 'special episode',
};
