import { ANIME_ESTADO_FILTER_ENTRIES } from '../../../../shared/constants/anime-estado';
import type { HistoryFilterOption } from './history-table.types';

/** Number of History rows shown per page (Legacy parity). */
export const HISTORY_TABLE_PAGE_SIZE = 10;

/** Debounce delay applied to the free-text name search before it filters rows. */
export const HISTORY_TABLE_SEARCH_DEBOUNCE_MS = 200;

/** Sentinel value used by the estado filter to mean "no filter applied". */
export const HISTORY_TABLE_ESTADO_ALL_VALUE = 'all';

/**
 * Options for the visible estado filter control. Labels come from the
 * canonical shared vocabulary (`shared/constants/anime-estado.ts`) so estado
 * wording stays consistent across every feature; only the "All" sentinel is
 * feature-local.
 */
export const HISTORY_TABLE_ESTADO_OPTIONS: readonly HistoryFilterOption[] = [
  { value: HISTORY_TABLE_ESTADO_ALL_VALUE, label: 'All' },
  ...ANIME_ESTADO_FILTER_ENTRIES,
];

/** Sentinel value used by the tipo filter to mean "no filter applied". */
export const HISTORY_TABLE_TIPO_ALL_VALUE = 'all';

/**
 * Options for the visible tipo filter control. Value domain verified against
 * the REAL fixture (`animes.dat` distinct tipo = 0/1/2/3 + null) and
 * Legacy's dropdown order: 0=Anime (TV), 1=Película, 2=Especial, 3=OVA —
 * Legacy data literals, kept verbatim. Entries with an absent `tipo` only
 * match "All".
 */
export const HISTORY_TABLE_TIPO_OPTIONS: readonly HistoryFilterOption[] = [
  { value: HISTORY_TABLE_TIPO_ALL_VALUE, label: 'All' },
  { value: '0', label: 'Anime (TV)' },
  { value: '1', label: 'Película' },
  { value: '2', label: 'Especial' },
  { value: '3', label: 'OVA' },
];

/** Sort value meaning "keep the server's fechaUltCapVisto DESC order" (default, no client re-sort). */
export const HISTORY_TABLE_SORT_ULT_CAP_VISTO_VALUE = 'ult-cap-visto';

/** Sort value meaning "Name, A-Z, with an id tie-break". */
export const HISTORY_TABLE_SORT_NOMBRE_VALUE = 'nombre';

/** Sort value meaning "Date created, DESC, absent-last". */
export const HISTORY_TABLE_SORT_FECHA_CREACION_VALUE = 'fecha-creacion';

/**
 * Options for the visible "Sort" control (spec: Orden). Defaults to
 * `HISTORY_TABLE_SORT_ULT_CAP_VISTO_VALUE`, matching the read model's server
 * order (recency DESC).
 */
export const HISTORY_TABLE_SORT_OPTIONS: readonly HistoryFilterOption[] = [
  { value: HISTORY_TABLE_SORT_ULT_CAP_VISTO_VALUE, label: 'Last watched' },
  { value: HISTORY_TABLE_SORT_NOMBRE_VALUE, label: 'Name (A-Z)' },
  { value: HISTORY_TABLE_SORT_FECHA_CREACION_VALUE, label: 'Date created' },
];

/** Accessible label for the History table region. */
export const HISTORY_TABLE_LABEL = 'Anime history';

/** Label shown while the History surface is loading. */
export const HISTORY_TABLE_LOADING_LABEL = 'Loading history...';

/** Title shown when the History surface has zero matching entries. */
export const HISTORY_TABLE_EMPTY_TITLE = 'No history yet';

/** Helper message shown alongside the empty title. */
export const HISTORY_TABLE_EMPTY_MESSAGE = 'No animes match the current search and filters.';

/** Placeholder for the History name search input. */
export const HISTORY_TABLE_SEARCH_PLACEHOLDER = 'Search by name...';

/** Visible label for the History name search input, aligning it with the other labeled filter-row controls. */
export const HISTORY_TABLE_SEARCH_LABEL = 'Search';

/** Number of skeleton placeholder rows shown while History is loading. */
export const HISTORY_TABLE_SKELETON_ROW_COUNT = 5;
