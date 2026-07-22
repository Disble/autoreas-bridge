import type { AnimeEditorScheduleBoard } from '../../../../shared/contracts/anime.types';
import type { AnimeScheduleOrderingCreateSubmit, AnimeScheduleOrderingDraftEntry } from '../../../anime-schedule-ordering/ui/AnimeScheduleOrdering/anime-schedule-ordering.types';

/** One batch-create row before submit: primary fields plus optional metadata. */
export interface AnimeCreateRowDraft {
  readonly draftId: string;
  readonly name: string;
  readonly page: string;
  readonly folder: string;
  /** Legacy numeric `tipo` as a Select-compatible string; `''` means unset. */
  readonly kind: string;
  /** Unix-millis premiere date as a string; `''` means unset. */
  readonly premieredAt: string;
}

/** Patchable fields for one row (every field but its stable `draftId`). */
export type AnimeCreateRowPatch = Partial<Omit<AnimeCreateRowDraft, 'draftId'>>;

/** View model returned by the colocated `anime-create` hook. */
export interface AnimeCreateViewModel {
  readonly rows: readonly AnimeCreateRowDraft[];
  readonly board?: AnimeEditorScheduleBoard;
  readonly draftEntries: readonly AnimeScheduleOrderingDraftEntry[];
  readonly lockedAnimeIds: readonly string[];
  readonly feedback?: string;
  readonly isSubmitting: boolean;
  readonly canRemoveRow: boolean;
  readonly onAddRow: () => void;
  readonly onRemoveRow: (draftId: string) => void;
  readonly onRowChange: (draftId: string, patch: AnimeCreateRowPatch) => void;
  readonly onBrowseFolder: (draftId: string) => void;
  readonly onApplyCreateSubmit: (submit: AnimeScheduleOrderingCreateSubmit) => Promise<void>;
}
