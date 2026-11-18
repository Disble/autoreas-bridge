import type { LabeledSelectOption } from '../ui/LabeledSelect.types';
import { FILTER_TAG_ALL_VALUE } from '../ui/FilterTagGroup/filter-tag-group.constants';
import { ANIME_ESTADO_FILTER_ENTRIES } from './anime-estado.constants';
import { ANIME_TIPO_FILTER_ENTRIES } from './anime-tipo.constants';

/**
 * Status filter tags in the order the Catalog's Status sort uses: what is being
 * watched first, the dropped last, after the All tag.
 */
export const ANIME_STATUS_FILTER_OPTIONS: readonly LabeledSelectOption[] = [
  { value: FILTER_TAG_ALL_VALUE, label: 'All' },
  ...[0, 1, 3, 2].map((status) => ANIME_ESTADO_FILTER_ENTRIES[status]),
];

/** Type filter tags: the closed `tipo` enum after the All tag, never discovered from the data. */
export const ANIME_KIND_FILTER_OPTIONS: readonly LabeledSelectOption[] = [
  { value: FILTER_TAG_ALL_VALUE, label: 'All' },
  ...ANIME_TIPO_FILTER_ENTRIES,
];
