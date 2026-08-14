import type { AnimeEditorRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import type { AnimeEditorRecord, AnimeEditorSaveResult, AnimeEditorScheduleApplyResult, ApplyAnimeScheduleDraftEntry } from '../../../../shared/contracts/anime.types';
import type { AnimeScheduleOrderingTestDriverRef } from '../../../../shared/ordering/ui/AnimeScheduleOrdering/anime-schedule-ordering.types';

/** Route input for the ID-driven Anime Editor workspace. */
export interface AnimeEditorWorkspaceProps {
  readonly initialAnimeId?: string;
  readonly scheduleTestDriverRef?: AnimeScheduleOrderingTestDriverRef;
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
  readonly premieredAt: string;
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
}

/** Inferred view model consumed by the dumb editor components. */
export type AnimeEditorWorkspaceViewModel = ReturnType<typeof import('./use-anime-editor-workspace').useAnimeEditorWorkspace>;

/** Props for the independently scrolling editor list panel. */
export interface AnimeEditorListPanelProps {
  readonly viewModel: AnimeEditorWorkspaceViewModel;
}

/** Props for the independently scrolling editor form panel. */
export interface AnimeEditorFormPanelProps {
  readonly viewModel: AnimeEditorWorkspaceViewModel;
}

/** Props for guard and schedule modal rendering. */
export interface AnimeEditorDialogsProps {
  readonly viewModel: AnimeEditorWorkspaceViewModel;
  readonly scheduleTestDriverRef?: AnimeScheduleOrderingTestDriverRef;
}

/** Collaborators consumed by guarded editor transition orchestration. */
export interface UseAnimeEditorTransitionsOptions {
  readonly selectedAnimeId?: string;
  readonly loadItems: () => Promise<void>;
  readonly setSelectedAnimeId: (animeId: string) => void;
  readonly loadRecord: (animeId: string) => Promise<void>;
  readonly saveRecord: () => Promise<AnimeEditorSaveResult | undefined>;
  readonly deactivateRecord: () => Promise<AnimeEditorSaveResult | undefined>;
  readonly activateRecord: () => Promise<{ readonly status: string } | undefined>;
  readonly discardRecord: () => void;
  readonly applySchedule: (entries: readonly ApplyAnimeScheduleDraftEntry[]) => Promise<AnimeEditorScheduleApplyResult | undefined>;
  readonly openSchedule: () => Promise<void>;
  readonly isDirty: boolean;
}
