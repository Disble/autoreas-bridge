import { ANIME_ESTADO_FILTER_ENTRIES } from '../../../../shared/constants/anime-estado.constants';
import { ANIME_TIPO_FILTER_ENTRIES } from '../../../../shared/constants/anime-tipo.constants';
import type { AnimeFilterOption, AnimeFilterState, CatalogEmptyStateCopy } from './catalog-panel.types';

/**
 * Heading of the alert shown when the catalog request itself failed. Kept
 * distinct from every empty state so an unavailable binding is never presented
 * as "you have no anime".
 */
export const CATALOG_PANEL_ERROR_TITLE = 'Catalog unavailable';

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

/**
 * Display label for active animes.
 */
export const ANIME_STATUS_ACTIVE_LABEL = 'Active';

/**
 * Display label for inactive animes.
 */
export const ANIME_STATUS_INACTIVE_LABEL = 'Inactive';

/**
 * Sentinel value used by filter selects to mean "no filter applied".
 */
export const ANIME_FILTER_ALL_VALUE = 'all';

/**
 * Debounce delay applied to the free-text search query before it is used to
 * filter the anime list.
 */
export const ANIME_FILTER_DEBOUNCE_MS = 200;

/**
 * Options for the "estado" filter select. Labels come from the canonical
 * shared vocabulary (`shared/constants/anime-estado.constants.ts`); only the "All"
 * sentinel is feature-local.
 */
export const ANIME_ESTADO_OPTIONS: readonly AnimeFilterOption[] = [
  { value: 'all', label: 'All' },
  ...ANIME_ESTADO_FILTER_ENTRIES,
];

/**
 * Options for the "tipo" (kind) filter select. `tipo` is a closed enum, so the
 * options are static and named from the canonical shared vocabulary
 * (`shared/constants/anime-tipo.constants.ts`) — never discovered dynamically
 * from the catalog data. Only the "All" sentinel is feature-local.
 */
export const ANIME_TIPO_OPTIONS: readonly AnimeFilterOption[] = [
  { value: ANIME_FILTER_ALL_VALUE, label: 'All' },
  ...ANIME_TIPO_FILTER_ENTRIES,
];

/**
 * Options for the "activo" filter select.
 */
export const ANIME_ACTIVO_OPTIONS: readonly AnimeFilterOption[] = [
  { value: 'all', label: 'All' },
  { value: '1', label: 'Active' },
  { value: '0', label: 'Inactive' },
];

/**
 * Sentinel value for the download gap filter meaning "only animes missing a
 * download page and/or folder".
 */
export const ANIME_GAP_MISSING_VALUE = 'missing';

/**
 * Sentinel value for the download gap filter meaning "only animes with both
 * a download page and a folder configured".
 */
export const ANIME_GAP_COMPLETE_VALUE = 'complete';

/**
 * Options for the download gap filter select.
 */
export const ANIME_GAP_OPTIONS: readonly AnimeFilterOption[] = [
  { value: ANIME_FILTER_ALL_VALUE, label: 'All' },
  { value: ANIME_GAP_MISSING_VALUE, label: 'Missing page/folder' },
  { value: ANIME_GAP_COMPLETE_VALUE, label: 'Complete' },
];

/**
 * Badge label shown when only the download page is missing.
 */
export const ANIME_GAP_LABEL_MISSING_PAGE = 'Missing page';

/**
 * Badge label shown when only the download folder is missing.
 */
export const ANIME_GAP_LABEL_MISSING_FOLDER = 'Missing folder';

/**
 * Badge label shown when both the download page and folder are missing.
 */
export const ANIME_GAP_LABEL_MISSING_BOTH = 'Missing page & folder';

/**
 * The all-records default every Catalog filter starts from and returns to.
 * One object rather than a literal repeated at the initial state and at the
 * reset, because a filter that drifts between those two makes "Clear search and
 * filters" quietly stop clearing.
 */
export const CATALOG_DEFAULT_FILTERS: AnimeFilterState = {
  query: '',
  estado: ANIME_FILTER_ALL_VALUE,
  activo: ANIME_FILTER_ALL_VALUE,
  tipo: ANIME_FILTER_ALL_VALUE,
  dia: ANIME_FILTER_ALL_VALUE,
  generos: [],
  gap: ANIME_FILTER_ALL_VALUE,
};
