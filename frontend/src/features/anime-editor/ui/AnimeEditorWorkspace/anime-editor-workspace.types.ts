import type { AnimeEditorRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import type { EpisodeDurationRuntimeSource, EpisodeDurationSaveResult } from '../../../../infrastructure/bridge-runtime-source/episode-duration-runtime-source.types';
import type { AnimeCoverEntry } from '../../../../shared/anime-cover/use-anime-cover';
import type { AnimeEditorRecord, AnimeEditorSaveResult, AnimeEditorScheduleApplyResult, ApplyAnimeScheduleDraftEntry } from '../../../../shared/contracts/anime.types';
import type { AnimeMetadataSelection, AppliedMetadata } from '../../../../shared/metadata-lookup/metadata-lookup.types';
import type { AnimeScheduleOrderingTestDriverRef } from '../../../../shared/ordering/ui/AnimeScheduleOrdering/anime-schedule-ordering.types';

/** Route input for the ID-driven Anime Editor workspace. */
export interface AnimeEditorWorkspaceProps {
  readonly initialAnimeId?: string;
  readonly scheduleTestDriverRef?: AnimeScheduleOrderingTestDriverRef;
  /** The Episodes card's source; production omits it and gets the Wails runtime source. */
  readonly episodeSource?: EpisodeDurationRuntimeSource;
}

/** Filter lenses supported by the left editor rail. */
export type AnimeEditorFilter = 'watching' | 'all';

/** Semantic HeroUI chip/select colors used by editor estado presentation. */
export type AnimeEditorChipColor = 'accent' | 'default' | 'success' | 'warning' | 'danger';

/** One selectable estado option rendered inside the status Select. */
export interface AnimeEditorStatusOption {
  readonly value: number;
  readonly label: string;
}

/** Lifecycle action gated behind a confirmation before any gateway write. */
export type AnimeEditorLifecycleAction = 'deactivate' | 'restore' | 'repeat';

/** The three lifecycle commands a confirmed lifecycle action runs. */
export interface AnimeEditorLifecycleCommands {
  readonly onDeactivate: () => Promise<void>;
  readonly onRestore: () => Promise<void>;
  readonly onRepeat: () => Promise<void>;
}

/**
 * Display-ready confirmation copy for the selected lifecycle action, driving
 * one generalized confirm modal instead of one hardcoded modal per action.
 * Mirrors `AnimeDetailConfirmationViewModel`'s shape (`anime-detail.types.ts`)
 * plus `isDestructive`, which Anime Detail's confirmations do not need.
 */
export interface AnimeEditorLifecycleConfirmation {
  readonly action: AnimeEditorLifecycleAction;
  readonly heading: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly isDestructive: boolean;
}

/** Deferred dirty-guard actions the workspace can resume after Save or Discard. */
export type AnimeEditorPendingAction =
  | { readonly type: 'select'; readonly animeId: string }
  | { readonly type: 'schedule' }
  | { readonly type: 'navigate'; readonly path: string }
  | { readonly type: 'history-back' }
  | undefined;

/** Reducer state for every guarded editor transition. */
export interface AnimeEditorGuardState {
  readonly pendingAction: AnimeEditorPendingAction;
}

/** Events accepted by the guarded editor transition state machine. */
export type AnimeEditorGuardEvent =
  | { readonly type: 'request'; readonly action: Exclude<AnimeEditorPendingAction, undefined> }
  | { readonly type: 'stay' }
  | { readonly type: 'complete' };

/** Inputs for the focused authoritative record-editing hook. */
export interface UseAnimeEditorRecordOptions {
  readonly selectedAnimeId?: string;
  readonly source: AnimeEditorRuntimeSource;
}

/**
 * Everything the focused metadata applied/undo hook hands back to the record
 * hook that composes it (design D9). Split out of `UseAnimeEditorRecordOptions`'s
 * owning hook so the applied/undo state, its confirm/undo handlers, and its
 * reset live in one cohesive place (fallow complexity guard).
 */
export interface UseAnimeEditorMetadataPatchResult {
  /** The draft's pending Undo -- absent once undone, discarded, or never applied. */
  readonly appliedMetadata: AppliedMetadata<Partial<AnimeEditorDraft>> | undefined;
  /** Applies a confirmed MyAnimeList selection to the draft. */
  readonly onMetadataApplied: (selection: AnimeMetadataSelection) => void;
  /** Reverts the draft's last applied metadata patch. A no-op when nothing is applied. */
  readonly onMetadataUndo: () => void;
  /** Clears the pending Undo without replaying it -- called on record swap and on discard. */
  readonly resetAppliedMetadata: () => void;
}

/** Inputs for the single guarded-transition orchestrator. */
export interface UseAnimeEditorGuardOptions {
  readonly isDirty: boolean;
}

/** Inputs for global schedule-modal orchestration. */
export interface UseAnimeEditorScheduleOptions {
  readonly selectedAnimeId?: string;
  readonly source: AnimeEditorRuntimeSource;
}

/** Inputs for the watching-first list hook. */
export interface UseAnimeEditorListOptions {
  readonly initialAnimeId?: string;
  readonly source: AnimeEditorRuntimeSource;
}

/** Controlled form draft for the general anime editor. */
export interface AnimeEditorDraft {
  readonly name: string;
  readonly status: number;
  readonly progress: string;
  readonly totalEpisodes: string;
  readonly kind: string;
  readonly page: string;
  readonly folder: string;
  readonly origin: string;
  readonly duration: string;
  readonly genres: string;
  readonly studios: string;
  readonly coverType: string;
  readonly coverPath: string;
}

/** Cohesive record-editing state updated atomically by the focused record hook. */
export interface AnimeEditorRecordState {
  readonly selectedRecord?: AnimeEditorRecord;
  /** The anime data draft only; the Episodes card keeps its own draft (S15). */
  readonly draft: AnimeEditorDraft;
  readonly isLoadingRecord: boolean;
  readonly isSaving: boolean;
  readonly feedback?: string;
  readonly retainsAttemptedDraft: boolean;
}

/** One rendered list row in the left-hand anime rail. */
export interface AnimeEditorListItemViewModel {
  /** Collection key consumed by React Aria (mirrors {@link animeId}). */
  readonly id: string;
  readonly animeId: string;
  readonly nombre: string;
  readonly subtitle: string;
  readonly selected: boolean;
  /**
   * The backend list DTO's own cover-presence signal (`hasCover`). A `false`
   * row is never asked for a cover at all, so a blank or literal `"null"`
   * stored source cannot cost a binding call or reach an image element.
   */
  readonly hasCover: boolean;
}

/**
 * One rail row as the panel renders it: the list view model plus the cover
 * entry the shared rail cover cache resolved for that anime. Kept separate
 * from {@link AnimeEditorListItemViewModel} so the list projection (which
 * knows nothing about covers) stays the single source of the row's identity.
 */
export interface AnimeEditorListRowViewModel extends AnimeEditorListItemViewModel {
  readonly cover: AnimeCoverEntry;
}

/** Props for one rendered row of the Editor Library's rail. */
export interface AnimeEditorListRowProps {
  readonly item: AnimeEditorListRowViewModel;
  readonly onSelectAnime: (animeId: string) => void;
  /** Reports a decoded-cover failure so the owning hook degrades that row to its placeholder. */
  readonly onCoverImageError: (animeId: string) => void;
}

/** Props for the editor form header's saved-cover thumbnail slot. */
export interface AnimeEditorHeaderCoverProps {
  /**
   * The selected anime whose saved cover the header shows. Absent when no
   * record is loaded, in which case the slot renders nothing at all.
   */
  readonly animeId?: string;
  /** The cover entry the rail's shared cache resolved for that anime. */
  readonly cover: AnimeCoverEntry;
  /** Reports a decoded-cover failure so the owning hook degrades the header to its placeholder. */
  readonly onCoverImageError: (animeId: string) => void;
}

/**
 * The minimal cover-resolution port the rail depends on, matching
 * `bridgeRuntimeSource.getAnimeCover`'s shape so a test can inject a fake
 * without touching the Wails-backed singleton -- the same seam
 * `NotificationDetailCoverSource` and `EpisodeScheduleSource` already expose.
 * Optional because a non-Wails (browser/Vite) context has no binding at all,
 * which degrades to the placeholder instead of throwing.
 */
export interface AnimeEditorCoverSource {
  readonly getAnimeCover?: (animeId: string) => Promise<AnimeEditorCoverResult>;
}

/** One cover-binding result: a base64 data URL, or the explicit placeholder signal. */
export interface AnimeEditorCoverResult {
  readonly dataUrl?: string;
  readonly source: string;
}

/**
 * One anime whose cover the rail may resolve. Deliberately not the full list
 * row: the rail resolves covers for the progressive window's rows plus the
 * selected saved record, and both supply the same facts.
 */
export interface AnimeEditorCoverTarget {
  readonly animeId: string;
  readonly hasCover: boolean;
  /**
   * The stored cover source this target resolves when the rail knows it -- the
   * selected record's saved path or URL -- and absent for a list row, whose DTO
   * reports presence only (`hasCover`) and never the source itself.
   *
   * Two different versions describe two different covers, so the rail must
   * resolve again; a version that merely becomes known (or unknown again) does
   * not, because the art already resolved for that anime is still the art of
   * the source that was saved. This is what makes a saved cover change A->B
   * refetch while clicking between rows does not.
   */
  readonly coverVersion?: string;
}

/**
 * What one render of the rail must do about covers: the lookups it owes, the
 * animes it must drop back to the placeholder, and the source identity it
 * remembers once the plan is adopted.
 */
export interface AnimeEditorCoverRequestPlan {
  /** The anime ids to look up, each resolved exactly once for the adopted source. */
  readonly requests: readonly string[];
  /** Animes whose cover went away, so their cached art (and remembered source) must go too. */
  readonly invalidatedIds: readonly string[];
  readonly requestedVersions: ReadonlyMap<string, string | undefined>;
}

/** The rail's shared cover cache, consumed by both the rows and the detail header. */
export interface AnimeEditorCoverCache {
  /** Cover state keyed by anime id: loading, resolved, or placeholder. */
  readonly covers: ReadonlyMap<string, AnimeCoverEntry>;
  /** Degrades one anime's resolved cover to the placeholder after a failed image decode. */
  readonly onCoverImageError: (animeId: string) => void;
}

/** Inferred view model consumed by the dumb editor components. */
export type AnimeEditorWorkspaceViewModel = ReturnType<typeof import('./use-anime-editor-workspace').useAnimeEditorWorkspace>;

/** What the list panel reads: the workspace's memoized `listPanel` slice. */
export type AnimeEditorListPanelViewModel = AnimeEditorWorkspaceViewModel['listPanel'];

/** What the form panel reads: the workspace's memoized `formPanel` slice. */
export type AnimeEditorFormPanelViewModel = AnimeEditorWorkspaceViewModel['formPanel'];

/** Props for the independently scrolling editor list panel. */
export interface AnimeEditorListPanelProps {
  readonly viewModel: AnimeEditorListPanelViewModel;
}

/** Props for the independently scrolling editor form panel. */
export interface AnimeEditorFormPanelProps {
  readonly viewModel: AnimeEditorFormPanelViewModel;
}

/** Props for guard and schedule modal rendering. */
export interface AnimeEditorDialogsProps {
  readonly viewModel: AnimeEditorWorkspaceViewModel;
  readonly scheduleTestDriverRef?: AnimeScheduleOrderingTestDriverRef;
}

/** One card the guard's "Save and continue" may save: whether it is dirty, and how it saves. */
export interface AnimeEditorGuardCardSave {
  readonly isDirty: boolean;
  readonly save: () => Promise<AnimeEditorSaveResult | undefined>;
}

/** Collaborators consumed by guarded editor transition orchestration. */
export interface UseAnimeEditorTransitionsOptions {
  readonly selectedAnimeId?: string;
  readonly loadItems: () => Promise<void>;
  readonly setSelectedAnimeId: (animeId: string) => void;
  readonly loadRecord: (animeId: string) => Promise<void>;
  readonly saveRecord: () => Promise<AnimeEditorSaveResult | undefined>;
  readonly deactivateRecord: () => Promise<AnimeEditorSaveResult | undefined>;
  readonly restoreRecord: () => Promise<{ readonly status: string } | undefined>;
  readonly repeatRecord: () => Promise<{ readonly status: string } | undefined>;
  /** Discards the anime data draft; the guard's "Discard changes" drops it with the episodes draft. */
  readonly discardRecord: () => void;
  /** Discards the Episodes card's own draft. */
  readonly discardEpisodes: () => void;
  readonly applySchedule: (entries: readonly ApplyAnimeScheduleDraftEntry[]) => Promise<AnimeEditorScheduleApplyResult | undefined>;
  readonly openSchedule: () => Promise<void>;
  /** Reads the schedule board again after an anime save. */
  readonly reloadSchedule: () => Promise<void>;
  /** Saves the Episodes card's own draft. */
  readonly saveEpisodes: () => Promise<EpisodeDurationSaveResult | undefined>;
  /** Whether either card is dirty; the one unsaved-changes guard covers both drafts (S15). */
  readonly isDirty: boolean;
  /** Whether the anime data card is dirty. */
  readonly isRecordDirty: boolean;
  /** Whether the Episodes card is dirty. */
  readonly isEpisodesDirty: boolean;
  /** Whether the guard's Save and continue is blocked, as it is while a re-analysis runs. */
  readonly isGuardSaveBlocked: boolean;
}

/** Which Library empty state a resolved request produced, if any. */
export type AnimeEditorEmptyState = 'none' | 'actual' | 'criteria';

/** Everything the Library empty-state classifier reads, and nothing more. */
export interface AnimeEditorEmptyStateInput {
  readonly isLoadingList: boolean;
  /** Rows the resolved source returned, before search and filters. */
  readonly sourceCount: number;
  /** Rows left after search and filters. */
  readonly visibleCount: number;
  readonly query: string;
  readonly filter: AnimeEditorFilter;
}

/** Title and description shown by one Library empty state. */
export interface AnimeEditorEmptyStateCopy {
  readonly title: string;
  readonly description: string;
}
