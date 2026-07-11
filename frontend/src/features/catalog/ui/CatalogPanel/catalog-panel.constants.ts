import { ANIME_ESTADO_FILTER_ENTRIES } from '../../../../shared/constants/anime-estado.constants';
import type { AnimeLegacyPullResult } from '../../../../shared/contracts/anime.types';
import type { AnimeFilterOption } from './catalog-panel.types';

/**
 * Label shown when the anime catalog is empty or the runtime binding is
 * unavailable.
 */
export const CATALOG_PANEL_EMPTY_TITLE = 'No animes found';

/**
 * Helper message shown alongside the empty title.
 */
export const CATALOG_PANEL_EMPTY_MESSAGE = 'The local anime catalog is empty or still loading.';

/**
 * Display label for active animes.
 */
export const ANIME_STATUS_ACTIVE_LABEL = 'Active';

/**
 * Display label for inactive animes.
 */
export const ANIME_STATUS_INACTIVE_LABEL = 'Inactive';

/**
 * Accessible label for the anime list region.
 */
export const CATALOG_PANEL_LIST_LABEL = 'Anime catalog';

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
 * Options for the "activo" filter select.
 */
export const ANIME_ACTIVO_OPTIONS: readonly AnimeFilterOption[] = [
  { value: 'all', label: 'All' },
  { value: '1', label: 'Active' },
  { value: '0', label: 'Inactive' },
];

/**
 * Options for the "tipo" filter select. These are defaults; the UI also
 * derives actual values from the loaded catalog. Value domain verified
 * against the REAL fixture (`animes.dat` distinct tipo = 0/1/2/3 + null)
 * and Legacy's dropdown order: 0=Anime (TV), 1=Película, 2=Especial, 3=OVA
 * (Legacy data literals, kept verbatim — the earlier mapping mislabeled
 * tipo 2, Especial, as OVA).
 */
export const ANIME_TIPO_OPTIONS: readonly AnimeFilterOption[] = [
  { value: 'all', label: 'All' },
  { value: '0', label: 'Anime (TV)' },
  { value: '1', label: 'Película' },
  { value: '2', label: 'Especial' },
  { value: '3', label: 'OVA' },
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

/** Safe fallback shown when the manual legacy pull throws before returning a DTO. */
export const ANIME_LEGACY_PULL_FAILED_RESULT: AnimeLegacyPullResult = {
  message: 'Pull from legacy failed.',
  prunedCount: 0,
  status: 'error',
  updatedCount: 0,
  warningCount: 0,
};
