import type { EpisodeDurationEdit } from '../../shared/contracts/anime.types';

/** The saved anime the Episodes card reads: its id and its saved folder, total and type. */
export interface EpisodeDurationRequest {
  readonly animeId: string;
  readonly folder: string;
  readonly totalEpisodes?: number;
  readonly kind?: number;
}

/** Who set a section row's value, or why it has none. */
export type EpisodeDurationRowSource = 'measured' | 'manual' | 'manual_no_file' | 'not_measured' | 'not_measured_file_found';

/** Whether the draft's folder is unset, set but missing, or found on disk. */
export type EpisodeDurationFolderStatus = 'none' | 'missing' | 'found';

/** One episode row of the Editor's Episodes section. `durationMs` is zero when nothing is stored. */
export interface EpisodeDurationRow {
  readonly episode: number;
  readonly durationMs: number;
  readonly minutes: number;
  readonly long: boolean;
  readonly source: EpisodeDurationRowSource;
}

/** The Episodes section, or why it could not be read. */
export interface EpisodeDurationSection {
  readonly outcome: 'ok' | 'error';
  readonly message?: string;
  readonly folderStatus: EpisodeDurationFolderStatus;
  readonly rows: readonly EpisodeDurationRow[];
  /** Episode numbers found in the folder beyond Total episodes. */
  readonly beyondTotal: readonly number[];
  /** Whether the anime is TV, the only type whose episodes can run long. */
  readonly tv: boolean;
}

/** How a re-analysis as a whole ended. */
export type EpisodeReanalysisStatus = 'ok' | 'no_folder' | 'folder_missing' | 'no_files' | 'probe_unavailable' | 'interrupted' | 'cancelled';

/** What confirming the review would do to one episode. */
export type EpisodeReanalysisResult = 'unchanged' | 'update' | 'add' | 'manual_kept' | 'skipped' | 'unreadable' | 'not_reached';

/** One row of the re-analysis review. `episode` is zero for a skipped file with no readable number. */
export interface EpisodeReanalysisRow {
  readonly episode: number;
  readonly basename: string;
  readonly currentMs: number;
  readonly currentMinutes: number;
  readonly currentSource: string;
  readonly measuredMs: number;
  readonly measuredMinutes: number;
  readonly result: EpisodeReanalysisResult;
  /** Why a file was skipped, from the identity decision (for example `fractional`). */
  readonly detail?: string;
}

/** The re-analysis review the user confirms into the draft, or why none ran. */
export interface EpisodeReanalysisReview {
  readonly outcome: 'ok' | 'busy' | 'error';
  readonly message?: string;
  readonly status: EpisodeReanalysisStatus;
  readonly filesRecognized: number;
  readonly rows: readonly EpisodeReanalysisRow[];
}

/** The file a running re-analysis is about to measure: the `index`-th of `total`, for `episode`. */
export interface EpisodeReanalysisProgress {
  readonly animeId: string;
  readonly index: number;
  readonly total: number;
  readonly episode: number;
}

/** How saving the Episodes card ended: written, nothing to write, or refused. */
export type EpisodeDurationSaveOutcome = 'applied' | 'no_op' | 'error';

/** The answer to saving the Episodes card's edits: the outcome, why it failed, and how many rows changed. */
export interface EpisodeDurationSaveResult {
  readonly outcome: EpisodeDurationSaveOutcome;
  readonly message?: string;
  readonly changed: number;
}

/** Port for the Editor's episode-duration bindings and the re-analysis progress stream. */
export interface EpisodeDurationRuntimeSource {
  readonly getEpisodeDurationSection: (request: EpisodeDurationRequest) => Promise<EpisodeDurationSection>;
  readonly reanalyzeEpisodeDurations: (request: EpisodeDurationRequest) => Promise<EpisodeReanalysisReview>;
  readonly cancelEpisodeReanalysis: () => Promise<void>;
  /** Saves the Episodes card's own draft, apart from the anime data. */
  readonly saveEpisodeDurations: (animeId: string, edits: readonly EpisodeDurationEdit[]) => Promise<EpisodeDurationSaveResult>;
  readonly onEpisodeReanalysisProgress: (listener: (progress: EpisodeReanalysisProgress) => void) => () => void;
}
