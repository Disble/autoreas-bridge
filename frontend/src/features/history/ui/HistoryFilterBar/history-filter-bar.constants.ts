import { ANIME_TIPO_FILTER_ENTRIES } from '../../../../shared/constants/anime-tipo.constants';
import type { LabeledSelectOption } from '../../../../shared/ui/LabeledSelect.types';

/** Accessible name of the Sort control's trigger. */
export const HISTORY_FILTER_BAR_SORT_ARIA_LABEL = 'Sort watch history';

/** The four valid numeric `type` values, derived from the single canonical `tipo` vocabulary. */
export const HISTORY_PARAMS_TYPE_VALID_VALUES: readonly number[] = ANIME_TIPO_FILTER_ENTRIES.map((entry) =>
  Number(entry.value),
);

/** Matches a `YYYY-MM-DD` local calendar date, the only shape `from`/`to` accept. */
export const HISTORY_PARAMS_ISO_LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Sort control options for `HistoryFilterBar`, in display order (design D5). */
export const HISTORY_FILTER_BAR_SORT_OPTIONS: readonly LabeledSelectOption[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
];

/** Value `LabeledSelect` falls back to when its coerced selection is empty. */
export const HISTORY_FILTER_BAR_SORT_FALLBACK_VALUE = 'newest';
