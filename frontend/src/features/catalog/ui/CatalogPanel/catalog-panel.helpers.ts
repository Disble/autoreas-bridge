import type { Anime, AnimeLegacyPullStatus } from '../../../../shared/contracts/anime.types';
import {
  ANIME_FILTER_ALL_VALUE,
  ANIME_GAP_COMPLETE_VALUE,
  ANIME_GAP_LABEL_MISSING_BOTH,
  ANIME_GAP_LABEL_MISSING_FOLDER,
  ANIME_GAP_LABEL_MISSING_PAGE,
  ANIME_GAP_MISSING_VALUE,
  ANIME_STATUS_ACTIVE_LABEL,
  ANIME_STATUS_INACTIVE_LABEL,
} from './catalog-panel.constants';
import type { AnimeFilterOption, AnimeFilterState, AnimeStatus, AnimeViewModel } from './catalog-panel.types';

/**
 * Maps a manual legacy pull status to the matching HeroUI Alert semantic
 * status so real failures are rendered as danger, not as a soft warning.
 */
export function getAnimeLegacyPullAlertStatus(status: AnimeLegacyPullStatus): 'success' | 'warning' | 'danger' {
  if (status === 'ok') {
    return 'success';
  }

  if (status === 'in_progress') {
    return 'warning';
  }

  return 'danger';
}

/**
 * Maps the backend `activo` flag (1 = active, 0 = inactive/absent) to a
 * normalized status value used by the UI.
 */
export function toAnimeStatus(activo: number): AnimeStatus {
  return activo === 1 ? 'active' : 'inactive';
}

/**
 * Builds a human-readable progress label from the current and total episode
 * counters. Falls back to "?" when a value is missing.
 */
export function formatAnimeProgress(current: number, total?: number): string {
  if (total === undefined) {
    return `${current} / ?`;
  }
  return `${current} / ${total}`;
}

/**
 * Returns a human-readable gap label describing which download prerequisite
 * (page, folder, or both) is missing. Returns `undefined` when neither is
 * missing — callers use this to decide whether to render a gap badge at all.
 */
function getAnimeGapLabel(hasDownloadPage: boolean, hasFolder: boolean): string | undefined {
  if (!hasDownloadPage && !hasFolder) {
    return ANIME_GAP_LABEL_MISSING_BOTH;
  }
  if (!hasDownloadPage) {
    return ANIME_GAP_LABEL_MISSING_PAGE;
  }
  if (!hasFolder) {
    return ANIME_GAP_LABEL_MISSING_FOLDER;
  }
  return undefined;
}

/**
 * Converts a runtime Anime DTO into the view model rendered by CatalogPanel.
 */
export function toAnimeViewModel(anime: Anime): AnimeViewModel {
  const status = toAnimeStatus(anime.activo);
  const gapLabel = getAnimeGapLabel(anime.hasDownloadPage, anime.hasFolder);

  return {
    id: anime.id,
    nombre: anime.nombre,
    estado: anime.estado,
    progressLabel: formatAnimeProgress(anime.nrocapvisto, anime.totalcap),
    status,
    statusLabel: status === 'active' ? ANIME_STATUS_ACTIVE_LABEL : ANIME_STATUS_INACTIVE_LABEL,
    hasDownloadPage: anime.hasDownloadPage,
    hasFolder: anime.hasFolder,
    hasDownloadGap: gapLabel !== undefined,
    gapLabel,
  };
}

/**
 * Sorts animes by name ascending, using the id as a stable tie-breaker.
 */
export function sortAnimesByName(a: Anime, b: Anime): number {
  const nameA = a.nombre.toLowerCase();
  const nameB = b.nombre.toLowerCase();
  if (nameA !== nameB) {
    return nameA < nameB ? -1 : 1;
  }

  if (a.id < b.id) {
    return -1;
  }

  if (a.id > b.id) {
    return 1;
  }

  return 0;
}

/**
 * Normalizes a free-text query by trimming whitespace and lowercasing it.
 * Empty queries match every item.
 */
function normalizeAnimeQuery(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * Returns true when the anime name contains the normalized query.
 */
function matchesAnimeQuery(item: Anime, query: string): boolean {
  const normalized = normalizeAnimeQuery(query);

  if (normalized.length === 0) {
    return true;
  }

  return item.nombre.toLowerCase().includes(normalized);
}

/**
 * Returns true when the anime `estado` matches the selected filter value.
 */
function matchesAnimeEstado(item: Anime, value: string): boolean {
  if (value === ANIME_FILTER_ALL_VALUE) {
    return true;
  }

  return item.estado === Number(value);
}

/**
 * Returns true when the anime `activo` flag matches the selected filter value.
 */
function matchesAnimeActivo(item: Anime, value: string): boolean {
  if (value === ANIME_FILTER_ALL_VALUE) {
    return true;
  }

  return item.activo === Number(value);
}

/**
 * Returns true when the anime `tipo` matches the selected filter value.
 */
function matchesAnimeTipo(item: Anime, value: string): boolean {
  if (value === ANIME_FILTER_ALL_VALUE) {
    return true;
  }

  return item.tipo === Number(value);
}

/**
 * Returns true when the anime has at least one of the selected days.
 */
function matchesAnimeDia(item: Anime, value: string): boolean {
  if (value === ANIME_FILTER_ALL_VALUE) {
    return true;
  }

  return item.dias.some((dia) => dia.toLowerCase() === value.toLowerCase());
}

/**
 * Returns true when the anime has at least one of the selected genres.
 */
function matchesAnimeGeneros(item: Anime, values: readonly string[]): boolean {
  if (values.length === 0) {
    return true;
  }

  const selected = new Set(values.map((value) => value.toLowerCase()));

  return item.generos.some((genero) => selected.has(genero.toLowerCase()));
}

/**
 * Returns true when the anime matches the selected download-gap filter value:
 * `all` matches everything, `missing` matches animes missing a page and/or
 * folder, `complete` matches animes that have both.
 */
export function matchesAnimeGap(item: Anime, value: string): boolean {
  if (value === ANIME_FILTER_ALL_VALUE) {
    return true;
  }

  const hasGap = !item.hasDownloadPage || !item.hasFolder;

  if (value === ANIME_GAP_MISSING_VALUE) {
    return hasGap;
  }

  if (value === ANIME_GAP_COMPLETE_VALUE) {
    return !hasGap;
  }

  return true;
}

/**
 * Filters a list of animes according to the current filter state.
 */
export function filterAnimes(
  items: readonly Anime[],
  filters: AnimeFilterState,
): readonly Anime[] {
  return items.filter(
    (item) =>
      matchesAnimeQuery(item, filters.query) &&
      matchesAnimeEstado(item, filters.estado) &&
      matchesAnimeActivo(item, filters.activo) &&
      matchesAnimeTipo(item, filters.tipo) &&
      matchesAnimeDia(item, filters.dia) &&
      matchesAnimeGeneros(item, filters.generos) &&
      matchesAnimeGap(item, filters.gap),
  );
}

function uniqueSortedStrings(values: readonly string[]): readonly string[] {
  const unique = new Set<string>();

  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      unique.add(trimmed);
    }
  }

  return Array.from(unique).sort((a, b) => a.localeCompare(b));
}

function toDynamicOptions(values: readonly string[]): readonly AnimeFilterOption[] {
  return [
    { value: ANIME_FILTER_ALL_VALUE, label: 'All' },
    ...uniqueSortedStrings(values).map((value) => ({ value, label: value })),
  ];
}

/**
 * Builds the "día" filter options from the actual catalog values, prepending
 * an "All" option.
 */
export function getUniqueDiaOptions(items: readonly Anime[]): readonly AnimeFilterOption[] {
  return toDynamicOptions(items.flatMap((item) => item.dias));
}

/**
 * Builds the "género" filter options from the actual catalog values.
 * Genres use a multi-select, so no "All" option is prepended.
 */
export function getUniqueGeneroOptions(items: readonly Anime[]): readonly AnimeFilterOption[] {
  return uniqueSortedStrings(items.flatMap((item) => item.generos)).map((value) => ({
    value,
    label: value,
  }));
}
