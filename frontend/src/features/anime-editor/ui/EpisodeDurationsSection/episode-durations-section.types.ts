import type {
  EpisodeDurationRequest,
  EpisodeDurationRuntimeSource,
  EpisodeDurationSection,
  EpisodeReanalysisProgress,
  EpisodeReanalysisReview,
} from '../../../../infrastructure/bridge-runtime-source/episode-duration-runtime-source.types';
import type { EpisodeDurationEdit } from '../../../../shared/contracts/anime.types';

/** Semantic HeroUI chip colors the section and its review use. */
export type EpisodeChipColor = 'accent' | 'default' | 'success' | 'warning' | 'danger';

/** Title and description of one Episodes empty state. */
export interface EpisodeDurationsEmptyCopy {
  readonly title: string;
  readonly description: string;
}

/** Label and chip color of one review row result. */
export interface EpisodeReanalysisResultView {
  readonly label: string;
  readonly color: EpisodeChipColor;
}

/**
 * What the Editor hands the Episodes card: the SAVED anime record's folder,
 * total and type, never the anime card's unsaved draft (S15).
 */
export interface UseEpisodeDurationsSectionOptions {
  /** The loaded record's anime; absent while no record is loaded, which loads nothing. */
  readonly animeId?: string;
  readonly folder: string;
  readonly totalEpisodes: string;
  readonly kind: string;
}

/** What the card's section read needs: the saved anime, the card's own draft edits, and its save revision. */
export interface UseEpisodeDurationsLoadOptions extends UseEpisodeDurationsSectionOptions {
  /** The card's unsaved episode edits. */
  readonly edits: readonly EpisodeDurationEdit[];
  /** Bumped after each successful episodes save, so the card reads the stored durations again. */
  readonly revision: number;
}

/** Collaborators of the card's own draft hook. */
export interface UseEpisodeDurationsDraftOptions {
  /** The saved anime; switching to another one starts an empty draft. */
  readonly animeId?: string;
  readonly source: EpisodeDurationRuntimeSource;
}

/** The Episodes card's own draft: its edits, save revision, save in flight and last save failure. */
export interface EpisodeDurationsDraftState {
  readonly edits: readonly EpisodeDurationEdit[];
  readonly revision: number;
  readonly isSaving: boolean;
  /** Why the last save failed; cleared by the next save or by Discard changes. */
  readonly saveError?: string;
}

/** What the footer helper reads: how many edits, whether the table shows, and what runs. */
export interface EpisodeDurationsFooterInput {
  readonly changes: number;
  readonly isOpen: boolean;
  readonly isRunning: boolean;
  readonly isSaving: boolean;
}

/** The card footer: whether it shows, its unsaved count and which actions are enabled. */
export interface EpisodeDurationsFooterView {
  readonly isVisible: boolean;
  /** "1 unsaved change", "3 unsaved changes" or "No unsaved changes". */
  readonly unsavedLabel: string;
  readonly canSave: boolean;
  readonly canDiscard: boolean;
}

/** Collaborators of the section's focused re-analysis hook. */
export interface UseEpisodeReanalysisOptions {
  readonly request?: EpisodeDurationRequest;
  readonly edits: readonly EpisodeDurationEdit[];
  readonly onEditsChange: (edits: readonly EpisodeDurationEdit[]) => void;
  readonly source: EpisodeDurationRuntimeSource;
}

/** Collaborators of the section's focused edit and add modal hook. */
export interface UseEpisodeDurationFormsOptions {
  readonly rows: readonly EpisodeDurationRowView[];
  readonly edits: readonly EpisodeDurationEdit[];
  readonly onEditsChange: (edits: readonly EpisodeDurationEdit[]) => void;
  /** Whether the anime is TV; the add modal's long hint applies to TV only. */
  readonly isTV: boolean;
}

/** Where the section request stands: nothing to read, in flight, read, or failed. */
export type EpisodeDurationsLoad =
  | { readonly status: 'idle'; readonly section?: undefined; readonly message?: undefined }
  | { readonly status: 'loading'; readonly section?: undefined; readonly message?: undefined }
  | { readonly status: 'ready'; readonly section: EpisodeDurationSection; readonly message?: undefined }
  | { readonly status: 'failed'; readonly section?: undefined; readonly message: string };

/** Which exclusive body the section renders. */
export type EpisodeDurationsView = 'idle' | 'loading' | 'failed' | 'empty' | 'table';

/** One rendered table row: the stored row with the draft's unsaved edit applied. */
export interface EpisodeDurationRowView {
  readonly id: string;
  readonly episode: number;
  /** Zero-padded episode number, the way the table shows it. */
  readonly number: string;
  /** The current value in ms, zero when the row has none. */
  readonly durationMs: number;
  /** "24 min", or an em dash when the row has no value. */
  readonly durationLabel: string;
  readonly hasDuration: boolean;
  /** Whether a value is stored in the database (the draft may still clear it). */
  readonly isStored: boolean;
  readonly isLong: boolean;
  readonly isUnsaved: boolean;
  readonly sourceLabel: string;
  /** The line the edit modal shows under its title. */
  readonly sourceLine: string;
  readonly editLabel: string;
}

/** The closed-trigger summary: "N of M measured" plus the long count. */
export interface EpisodeDurationsSummary {
  readonly label: string;
  /** "1 long", absent when no episode runs long. */
  readonly longLabel?: string;
}

/** The one status alert above the table, when the section has something to say. */
export interface EpisodeDurationsBanner {
  readonly status: 'accent' | 'warning';
  readonly title: string;
  readonly description: string;
}

/** The icon-only re-analysis button: enabled or why not, carried in its accessible name. */
export interface EpisodeReanalyzeButtonView {
  readonly isDisabled: boolean;
  readonly ariaLabel: string;
  readonly tooltip: string;
}

/** The running analysis' progress line and bar. */
export interface EpisodeReanalysisProgressView {
  readonly label: string;
  readonly percent: number;
}

/** One rendered review row. */
export interface EpisodeReviewRowView {
  readonly id: string;
  readonly number: string;
  readonly current: string;
  readonly measured: string;
  readonly result: EpisodeReanalysisResultView;
}

/** One summary chip of the review. */
export interface EpisodeReviewChipView {
  readonly id: string;
  readonly label: string;
  readonly color: EpisodeChipColor;
}

/** The whole review modal, ready to render. */
export interface EpisodeReviewView {
  readonly folder: string;
  readonly alertStatus: 'success' | 'warning' | 'danger';
  readonly title: string;
  readonly description: string;
  readonly chips: readonly EpisodeReviewChipView[];
  readonly rows: readonly EpisodeReviewRowView[];
  /** "Confirm 3 changes" or "Apply 1 change"; absent when there is nothing to move into the draft. */
  readonly confirmLabel?: string;
  /** Whether "Try again" is offered (an interrupted analysis). */
  readonly canTryAgain: boolean;
  /** "Cancel" beside a confirm action, "Close" when it is the only action. */
  readonly dismissLabel: string;
  /** The dismiss button is the primary action only when nothing can be confirmed. */
  readonly dismissVariant: 'primary' | 'tertiary';
}

/** The open review: the raw result and the folder it read. */
export interface EpisodeOpenReview {
  readonly review: EpisodeReanalysisReview;
  readonly folder: string;
}

/** The running analysis: whether one runs and the latest progress for this anime. */
export interface EpisodeAnalysisState {
  readonly isRunning: boolean;
  readonly progress?: EpisodeReanalysisProgress;
}

/** The edit modal's state: which episode, and the minutes being typed. */
export interface EpisodeEditFormState {
  readonly episode: number;
  readonly minutes: string;
}

/** The edit modal, ready to render. */
export interface EpisodeEditFormView {
  /** "Episode 04 duration". */
  readonly title: string;
  /** The minutes being typed. */
  readonly minutes: string;
  /** Who set the current value: "Measured from the file", "Set by hand", or "Not measured yet". */
  readonly sourceLine: string;
  readonly canApply: boolean;
  /** Clear duration is offered only when the episode has a value to clear. */
  readonly canClear: boolean;
}

/** The open edit modal: the row it edits and its view. */
export interface EpisodeOpenEdit {
  readonly row: EpisodeDurationRowView;
  readonly view: EpisodeEditFormView;
}

/** What the section shows about its read: the body, the trigger summary, the alert, notes and empty copy. */
export interface EpisodeDurationsOverview {
  readonly view: EpisodeDurationsView;
  readonly summary: EpisodeDurationsSummary | undefined;
  readonly banner: EpisodeDurationsBanner | undefined;
  readonly notes: readonly string[];
  /** The empty state's copy, present only when a read section lists no episode. */
  readonly emptyCopy: EpisodeDurationsEmptyCopy | undefined;
  readonly failureMessage: string | undefined;
  /** Whether the read section is TV, the only type whose episodes can run long. */
  readonly isTV: boolean;
}

/** The add modal's state: the episode number and the minutes being typed. */
export interface EpisodeAddFormState {
  readonly episode: string;
  readonly minutes: string;
}

/** The add modal, ready to render. */
export interface EpisodeAddFormView {
  /** The episode number being typed. */
  readonly episode: string;
  /** The minutes being typed. */
  readonly minutes: string;
  /** "Next after episode 7", absent when no episode is known yet. */
  readonly episodeHint?: string;
  /** "Episode 5 already has 24 min.", when the number already has a duration. */
  readonly duplicateMessage?: string;
  /** The episode the duplicate error offers to edit instead. */
  readonly duplicateEpisode?: number;
  /** "Edit episode 5 instead", beside the duplicate error. */
  readonly editInsteadLabel?: string;
  readonly isLongHintVisible: boolean;
  readonly canAdd: boolean;
}

/** Inferred view model the dumb section components render. */
export type EpisodeDurationsSectionViewModel = ReturnType<typeof import('./use-episode-durations-section').useEpisodeDurationsSection>;

/** Props for the Episodes card and its body. */
export interface EpisodeDurationsSectionProps {
  readonly viewModel: EpisodeDurationsSectionViewModel;
}

/** Props for the edit, add and review modals of the section. */
export interface EpisodeDurationsDialogsProps {
  readonly viewModel: EpisodeDurationsSectionViewModel;
}
