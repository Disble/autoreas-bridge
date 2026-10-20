import gridIcon from '@iconify-icons/tabler/layout-grid';
import listIcon from '@iconify-icons/tabler/list';
import { ANIME_ESTADO_FILTER_ENTRIES, ANIME_ESTADO_VALID_VALUES } from '../../../../shared/constants/anime-estado.constants';
import { ANIME_TIPO_FILTER_ENTRIES } from '../../../../shared/constants/anime-tipo.constants';
import type { CatalogCriteria, CatalogEmptyStateCopy, CatalogOption, CatalogSortKey, CatalogView, CatalogViewOption } from './catalog-panel.types';

/**
 * Heading of the alert shown when the catalog request itself failed. Kept
 * distinct from every empty state so an unavailable binding is never presented
 * as "you have no anime".
 */
export const CATALOG_PANEL_ERROR_TITLE = 'Catalog unavailable';

/**
 * Feedback shown, as the accessible name of the loading status region, while
 * the catalog request is unresolved.
 */
export const CATALOG_PANEL_LOADING_LABEL = 'Loading catalog';

/**
 * Accessible name of the "No Cover" poster, and the label a card draws over
 * it. The label is UI, never baked into the artwork, so a card still reads as
 * missing data rather than as a real cover.
 */
export const CATALOG_NO_COVER_LABEL = 'No cover';

/**
 * Uniform poster frame shared by real covers, the "No Cover" poster and their
 * skeletons. Stored covers vary in height; a deliberate crop to the dominant
 * 230:326 ratio keeps every grid row's titles on one baseline.
 */
export const CATALOG_COVER_FRAME_CLASS = 'block aspect-[230/326] w-full shrink-0 overflow-hidden bg-surface';

/** Auto-filling poster grid shared by the cards and their skeleton. */
export const CATALOG_GRID_CLASS = 'grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] items-start gap-x-5 gap-y-8 max-sm:grid-cols-2 max-sm:gap-x-3 max-sm:gap-y-6';

/**
 * Row geometry shared by the real list row and its skeleton, so the two cannot
 * drift apart silently: a 40px cover, the text column, the chip and the chevron.
 */
export const CATALOG_LIST_ROW_CLASS = 'grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-1 rounded-2xl px-3 py-2 sm:grid-cols-[2.5rem_minmax(0,1fr)_7.5rem_1rem]';

/** Accessible name of the grid or list holding the matching anime. */
export const CATALOG_RESULTS_LABEL = 'Anime catalog';

/** Accessible name of the removable active-filter chips. */
export const CATALOG_ACTIVE_FILTERS_LABEL = 'Active filters';

/** Footer once every matching anime is rendered. */
export const CATALOG_END_LABEL = 'End of catalog';

/** How many placeholder cards the grid draws while its request is unresolved. */
export const CATALOG_SKELETON_CARD_COUNT = 12;

/** How many placeholder rows the list draws while its request is unresolved. */
export const CATALOG_SKELETON_ROW_COUNT = 8;

/**
 * Copy for each Catalog empty state. The criteria wording deliberately never
 * claims the catalog is empty, because the anime are there — the filters are
 * hiding them.
 */
export const CATALOG_PANEL_EMPTY_STATE_COPY: Readonly<Record<'actual' | 'criteria', CatalogEmptyStateCopy>> = {
  actual: {
    title: 'Your catalog is empty',
    description: 'No anime are stored yet. Create one to start your catalog.',
  },
  criteria: {
    title: 'No anime match your criteria',
    description: 'The current search and filters hide every anime in your catalog.',
  },
};

/** Sentinel value a single-choice filter uses to mean "no filter applied". */
export const CATALOG_FILTER_ALL_VALUE = 'all';

/**
 * Debounce delay applied to the free-text search query before it is used to
 * filter the anime list.
 */
export const CATALOG_QUERY_DEBOUNCE_MS = 200;

/**
 * Status filter options in the order the Status sort uses: what is being
 * watched first, the dropped last. Labels come from the canonical shared
 * vocabulary; only the "All" sentinel is feature-local.
 */
export const CATALOG_STATUS_OPTIONS: readonly CatalogOption[] = [
  { value: CATALOG_FILTER_ALL_VALUE, label: 'All' },
  ...[0, 1, 3, 2].map((status) => ANIME_ESTADO_FILTER_ENTRIES[status]),
];

/**
 * Type filter options. `tipo` is a closed enum, so the options are static and
 * named from the canonical shared vocabulary, never discovered from the data.
 */
export const CATALOG_KIND_OPTIONS: readonly CatalogOption[] = [
  { value: CATALOG_FILTER_ALL_VALUE, label: 'All' },
  ...ANIME_TIPO_FILTER_ENTRIES,
];

/**
 * Rank of each `estado` under the Status sort: Viendo, Finalizado, En pausa,
 * then No me gusto. Bound to the shared value list so a vocabulary change
 * surfaces here instead of silently drifting.
 */
export const CATALOG_STATUS_SORT_RANK: Readonly<Record<number, number>> = {
  [ANIME_ESTADO_VALID_VALUES[0]]: 0,
  [ANIME_ESTADO_VALID_VALUES[1]]: 1,
  [ANIME_ESTADO_VALID_VALUES[3]]: 2,
  [ANIME_ESTADO_VALID_VALUES[2]]: 3,
};

/** Compares two names the way a person reads a shelf: case-insensitive, numbers by value. */
export const CATALOG_NAME_COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Sort select options, in display order. */
export const CATALOG_SORT_OPTIONS: readonly { readonly value: CatalogSortKey; readonly label: string }[] = [
  { value: 'name-asc', label: 'Name A–Z' },
  { value: 'name-desc', label: 'Name Z–A' },
  { value: 'status', label: 'Status' },
  { value: 'kind', label: 'Type' },
];

/** View toggle options; each is an icon-only button named by its label. */
export const CATALOG_VIEW_OPTIONS: readonly CatalogViewOption[] = [
  { value: 'grid', label: 'Grid view', icon: gridIcon },
  { value: 'list', label: 'List view', icon: listIcon },
];

/** Hint under the Genres group: genres narrow together, not as alternatives. */
export const CATALOG_GENRES_HINT = 'Shows anime that have every selected genre.';

/** Sort the Catalog opens with. */
export const CATALOG_DEFAULT_SORT: CatalogSortKey = 'name-asc';

/** Layout the Catalog opens with. */
export const CATALOG_DEFAULT_VIEW: CatalogView = 'grid';

/**
 * The all-records default every Catalog criterion starts from and returns to.
 * One object rather than a literal repeated at the initial state and at the
 * reset, because a filter that drifts between those two makes "Clear search and
 * filters" quietly stop clearing.
 */
export const CATALOG_DEFAULT_CRITERIA: CatalogCriteria = {
  query: '',
  status: CATALOG_FILTER_ALL_VALUE,
  kind: CATALOG_FILTER_ALL_VALUE,
  genres: [],
};
