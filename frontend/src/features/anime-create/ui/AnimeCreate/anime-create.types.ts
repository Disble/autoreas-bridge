import type { AnimeEditorScheduleBoard } from '../../../../shared/contracts/anime.types';
import type { AnimeMetadataSelection, AppliedMetadata } from '../../../../shared/metadata-lookup/metadata-lookup.types';
import type { AnimeMetadataLookupSource } from '../../../../shared/metadata-lookup/ui/AnimeMetadataLookupModal/use-anime-metadata-lookup';
import type { AnimeScheduleOrderingCreateSubmit, AnimeScheduleOrderingDraftEntry } from '../../../../shared/ordering/ui/AnimeScheduleOrdering/anime-schedule-ordering.types';

/**
 * One batch-create row before submit: primary fields plus optional metadata.
 * Every optional value is held as an input string (`''` means unset) and parsed
 * at command-build time. Premiere date is intentionally absent — it is an auto
 * lifecycle field, never user input.
 */
export interface AnimeCreateRowDraft {
  readonly draftId: string;
  readonly name: string;
  readonly page: string;
  readonly folder: string;
  /** True once the user set the folder directly (browse/typed) — stops name-derived auto-fill. */
  readonly folderManual: boolean;
  /** Legacy numeric `tipo` as a Select-compatible string; defaults to Anime (TV). */
  readonly kind: string;
  readonly episodesWatched: string;
  readonly totalEpisodes: string;
  readonly duration: string;
  readonly origin: string;
  /** `'url' | 'image'` cover source; defaults to `'url'`. */
  readonly coverType: string;
  readonly coverPath: string;
  /** Comma-separated genres; `''` means unset. */
  readonly genres: string;
  /** Comma-separated studios; `''` means unset. */
  readonly studios: string;
}

/** Patchable fields for one row (every field but its stable `draftId`). */
export type AnimeCreateRowPatch = Partial<Omit<AnimeCreateRowDraft, 'draftId'>>;

/** Props for one batch-create row card. */
export interface AnimeCreateRowProps {
  readonly row: AnimeCreateRowDraft;
  readonly index: number;
  readonly viewModel: AnimeCreateViewModel;
}

/** View model returned by the colocated `anime-create` hook. */
export interface AnimeCreateViewModel {
  readonly rows: readonly AnimeCreateRowDraft[];
  readonly board?: AnimeEditorScheduleBoard;
  readonly draftEntries: readonly AnimeScheduleOrderingDraftEntry[];
  readonly lockedAnimeIds: readonly string[];
  /** Why a row's name cannot be used, keyed by draft id; absent when it is free. */
  readonly nameConflicts: Readonly<Record<string, string>>;
  /** One row's pending Undo, keyed by draftId (design D9) -- absent once undone or never applied. */
  readonly appliedMetadataByRow: Readonly<Record<string, AppliedMetadata<AnimeCreateRowPatch>>>;
  /** The MyAnimeList lookup's two Wails-bound calls, injected into every row's lookup modal. */
  readonly metadataLookupSource: AnimeMetadataLookupSource;
  readonly feedback?: string;
  readonly isSubmitting: boolean;
  readonly canRemoveRow: boolean;
  /** True once every row has a name + page, so placement/create can proceed. */
  readonly canOpenBoard: boolean;
  /** Whether the schedule-placement board modal is open. */
  readonly isBoardOpen: boolean;
  /** Whether the "remove a row that has data" confirmation is open. */
  readonly isRemoveConfirmOpen: boolean;
  readonly onAddRow: () => void;
  readonly onRemoveRow: (draftId: string) => void;
  readonly onConfirmRemove: () => void;
  readonly onCancelRemove: () => void;
  readonly onRowChange: (draftId: string, patch: AnimeCreateRowPatch) => void;
  /** Applies a confirmed MyAnimeList selection to one row (design D9/D10). */
  readonly onMetadataApplied: (draftId: string, selection: AnimeMetadataSelection) => void;
  /** Reverts one row's last applied metadata patch (design D9). */
  readonly onMetadataUndo: (draftId: string) => void;
  readonly onBrowseFolder: (draftId: string) => void;
  readonly onBrowseCover: (draftId: string) => void;
  readonly onOpenBoard: () => void;
  readonly onCloseBoard: () => void;
  readonly onApplyCreateSubmit: (submit: AnimeScheduleOrderingCreateSubmit) => Promise<void>;
}
