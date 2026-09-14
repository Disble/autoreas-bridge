import { ANIME_ESTADO_FILTER_ENTRIES } from '../../../../shared/constants/anime-estado.constants';
import { ANIME_TIPO_FILTER_ENTRIES } from '../../../../shared/constants/anime-tipo.constants';
import type { LabeledSelectOption } from '../../../../shared/ui/LabeledSelect.types';

/** Accessible name of the Search control. */
export const HISTORY_FILTER_BAR_SEARCH_ARIA_LABEL = 'Search watch history';

/** Placeholder shown inside the Search control's input. */
export const HISTORY_FILTER_BAR_SEARCH_PLACEHOLDER = 'Search by name...';

/** Accessible name of the Status control's trigger. */
export const HISTORY_FILTER_BAR_STATUS_ARIA_LABEL = 'Filter by status';

/** Accessible name of the Type control's trigger. */
export const HISTORY_FILTER_BAR_TYPE_ARIA_LABEL = 'Filter by type';

/** Accessible name of the Sort control's trigger. */
export const HISTORY_FILTER_BAR_SORT_ARIA_LABEL = 'Sort watch history';

/** Accessible name of the watched-range `DateRangePicker`. */
export const HISTORY_FILTER_BAR_RANGE_ARIA_LABEL = 'Filter by watched date range';

/** Placeholder the watched-range trigger shows while no range is set. */
export const HISTORY_FILTER_BAR_RANGE_PLACEHOLDER = 'Any date';

/** Label of the calendar action that clears a committed watched range. */
export const HISTORY_FILTER_BAR_RANGE_CLEAR_LABEL = 'Clear dates';

/** Sentinel `LabeledSelect` value meaning "no Status/Type filter applied". */
export const HISTORY_FILTER_BAR_ALL_VALUE = 'all';

/** The four valid numeric `type` values, derived from the single canonical `tipo` vocabulary. */
export const HISTORY_PARAMS_TYPE_VALID_VALUES: readonly number[] = ANIME_TIPO_FILTER_ENTRIES.map((entry) =>
  Number(entry.value),
);

/** Matches a `YYYY-MM-DD` local calendar date, the only shape `from`/`to` accept. */
export const HISTORY_PARAMS_ISO_LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Status control options: the "All" sentinel plus the canonical estado vocabulary. */
export const HISTORY_FILTER_BAR_STATUS_OPTIONS: readonly LabeledSelectOption[] = [
  { value: HISTORY_FILTER_BAR_ALL_VALUE, label: 'All' },
  ...ANIME_ESTADO_FILTER_ENTRIES,
];

/** Type control options: the "All" sentinel plus the canonical tipo vocabulary. */
export const HISTORY_FILTER_BAR_TYPE_OPTIONS: readonly LabeledSelectOption[] = [
  { value: HISTORY_FILTER_BAR_ALL_VALUE, label: 'All' },
  ...ANIME_TIPO_FILTER_ENTRIES,
];

/** Sort control options for `HistoryFilterBar`, in display order (design D5). */
export const HISTORY_FILTER_BAR_SORT_OPTIONS: readonly LabeledSelectOption[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
];

/** Value `LabeledSelect` falls back to when its coerced selection is empty. */
export const HISTORY_FILTER_BAR_SORT_FALLBACK_VALUE = 'newest';
