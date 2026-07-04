import type { HistoryFilterOption } from './history-table.types';

/** Number of History rows shown per page (Legacy parity). */
export const HISTORY_TABLE_PAGE_SIZE = 10;

/** Debounce delay applied to the free-text name search before it filters rows. */
export const HISTORY_TABLE_SEARCH_DEBOUNCE_MS = 200;

/** Sentinel value used by the estado filter to mean "no filter applied". */
export const HISTORY_TABLE_ESTADO_ALL_VALUE = 'all';

/**
 * Options for the visible estado filter control. Value domain and labels
 * mirror `ANIME_ESTADO_OPTIONS` (`catalog-panel.constants.ts`) -- verified
 * against that feature rather than invented (0=Viendo, 1=Finalizado,
 * 2=Abandonado, 3=Pendiente). Duplicated per this repo's convention of
 * small, feature-local constants rather than a shared cross-feature import.
 */
export const HISTORY_TABLE_ESTADO_OPTIONS: readonly HistoryFilterOption[] = [
  { value: HISTORY_TABLE_ESTADO_ALL_VALUE, label: 'All' },
  { value: '0', label: 'Viendo' },
  { value: '1', label: 'Finalizado' },
  { value: '2', label: 'Abandonado' },
  { value: '3', label: 'Pendiente' },
];

/** Sentinel value used by the tipo filter to mean "no filter applied". */
export const HISTORY_TABLE_TIPO_ALL_VALUE = 'all';

/**
 * Options for the visible tipo filter control. Value domain and labels
 * mirror `ANIME_TIPO_OPTIONS` (`catalog-panel.constants.ts`) -- 0=Serie,
 * 1=Película, 2=OVA. Entries with an absent `tipo` only match "All".
 */
export const HISTORY_TABLE_TIPO_OPTIONS: readonly HistoryFilterOption[] = [
  { value: HISTORY_TABLE_TIPO_ALL_VALUE, label: 'All' },
  { value: '0', label: 'Serie' },
  { value: '1', label: 'Película' },
  { value: '2', label: 'OVA' },
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
