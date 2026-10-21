import type { Key, Selection } from '@heroui/react';
import { ANIME_ESTADO_VALID_VALUES } from '../../../../shared/constants/anime-estado.constants';
import type { Anime } from '../../../../shared/contracts/anime.types';
import { getAnimeEstadoLabel } from '../../../../shared/helpers/anime-estado.helpers';
import { getAnimeTipoLabel } from '../../../../shared/helpers/anime-tipo.helpers';
import { CATALOG_END_LABEL, CATALOG_FILTER_ALL_VALUE, CATALOG_NAME_COLLATOR, CATALOG_SORT_OPTIONS, CATALOG_STATUS_SORT_RANK } from './catalog-panel.constants';
import type {
  CatalogCover,
  CatalogCoverInput,
  CatalogCriteria,
  CatalogCriterionChip,
  CatalogEmptyState,
  CatalogEmptyStateInput,
  CatalogItemViewModel,
  CatalogOption,
  CatalogSortKey,
  CatalogStatusColor,
  CatalogView,
} from './catalog-panel.types';

/** Orders by name, falling back to the id so equal names keep a stable order. */
function compareByName(a: Anime, b: Anime): number {
  const byName = CATALOG_NAME_COLLATOR.compare(a.name, b.name);
  if (byName !== 0) {
    return byName;
  }
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? -1 : 1;
}

/** Status-sort rank of an `estado`; an unknown value sorts after every known one. */
function statusRank(status: number): number {
  return CATALOG_STATUS_SORT_RANK[status] ?? Number.MAX_SAFE_INTEGER;
}

/** Type-sort rank of a `tipo`; a missing value sorts after every known one. */
function kindRank(kind: number | undefined): number {
  return kind ?? Number.MAX_SAFE_INTEGER;
}

/** Orders a date newest first; a missing date sorts after every dated record. */
function compareNewestFirst(a: number | undefined, b: number | undefined): number {
  return (b ?? Number.MIN_SAFE_INTEGER) - (a ?? Number.MIN_SAFE_INTEGER);
}

/**
 * Returns the comparator for one Catalog sort. Status and Type group the
 * catalog, the two date sorts put the newest first, and every tie falls back
 * to the name.
 */
export function compareCatalogAnimes(sort: CatalogSortKey): (a: Anime, b: Anime) => number {
  switch (sort) {
    case 'last-watched':
      return (a, b) => compareNewestFirst(a.lastWatchedAt, b.lastWatchedAt) || compareByName(a, b);
    case 'created':
      return (a, b) => compareNewestFirst(a.createdAt, b.createdAt) || compareByName(a, b);
    case 'name-desc':
      return (a, b) => compareByName(b, a);
    case 'status':
      return (a, b) => statusRank(a.status) - statusRank(b.status) || compareByName(a, b);
    case 'kind':
      return (a, b) => kindRank(a.kind) - kindRank(b.kind) || compareByName(a, b);
    default:
      return compareByName;
  }
}

/** Narrows a select value to one of the Catalog sort keys. */
export function isCatalogSortKey(value: string): value is CatalogSortKey {
  return CATALOG_SORT_OPTIONS.some((option) => option.value === value);
}

/** Reads the sort select's key; a cleared (`"null"`) or unknown key keeps the current sort. */
export function toCatalogSortKey(key: Key | null, current: CatalogSortKey): CatalogSortKey {
  const value = String(key);
  return isCatalogSortKey(value) ? value : current;
}

/** Reads the view toggle's selection; anything but grid or list keeps the current view. */
export function toCatalogView(selection: Selection, current: CatalogView): CatalogView {
  const next = toCatalogChoice(selection, current);
  return next === 'grid' || next === 'list' ? next : current;
}

/** True when a filter group is set to All or names the record's value among its picks. */
function matchesAny(selected: readonly string[], value: number | undefined): boolean {
  return selected.length === 0 || selected.includes(String(value));
}

/** True when the record carries every selected genre, compared case-insensitively. */
function hasEveryGenre(item: Anime, genres: readonly string[]): boolean {
  const carried = new Set(item.genres.map((genre) => genre.toLowerCase()));
  return genres.every((genre) => carried.has(genre.toLowerCase()));
}

/** Keeps the records the search and every filter allow. */
export function filterCatalogAnimes(items: readonly Anime[], criteria: CatalogCriteria): readonly Anime[] {
  const query = criteria.query.trim().toLowerCase();
  return items.filter(
    (item) =>
      item.name.toLowerCase().includes(query) &&
      matchesAny(criteria.statuses, item.status) &&
      matchesAny(criteria.kinds, item.kind) &&
      hasEveryGenre(item, criteria.genres),
  );
}

/** How many filter values narrow the catalog: each status, type and genre picked. The search is not a filter. */
export function countActiveCatalogFilters(criteria: CatalogCriteria): number {
  return criteria.statuses.length + criteria.kinds.length + criteria.genres.length;
}

/** Reports whether anything the user could clear is narrowing the catalog. */
export function hasActiveCatalogCriteria(criteria: CatalogCriteria): boolean {
  return criteria.query.trim().length > 0 || countActiveCatalogFilters(criteria) > 0;
}

/** One removable chip per picked value, in popover order: statuses, types, then genres. */
export function toCatalogCriterionChips(criteria: CatalogCriteria): readonly CatalogCriterionChip[] {
  return [
    ...criteria.statuses.map((value) => ({
      id: `status:${value}`, field: 'statuses' as const, value, groupLabel: 'Status', valueLabel: getAnimeEstadoLabel(Number(value)),
    })),
    ...criteria.kinds.map((value) => ({
      id: `kind:${value}`, field: 'kinds' as const, value, groupLabel: 'Type', valueLabel: getAnimeTipoLabel(Number(value)),
    })),
    ...criteria.genres.map((value) => ({ id: `genre:${value}`, field: 'genres' as const, value, groupLabel: 'Genre', valueLabel: value })),
  ];
}

/** Drops the value a chip names from its group, leaving every other criterion as it was. */
export function removeCatalogCriterion(criteria: CatalogCriteria, chip: CatalogCriterionChip): CatalogCriteria {
  return { ...criteria, [chip.field]: criteria[chip.field].filter((value) => value !== chip.value) };
}

/** Drops every criterion whose chip id is among the removed keys, in one update. */
export function removeCatalogCriterionChips(
  criteria: CatalogCriteria,
  chips: readonly CatalogCriterionChip[],
  removedIds: Iterable<string | number>,
): CatalogCriteria {
  const removed = new Set(Array.from(removedIds, String));
  return chips.filter((chip) => removed.has(chip.id)).reduce(removeCatalogCriterion, criteria);
}

/**
 * Reads a single-choice filter group's selection. The groups disallow an empty
 * selection and never offer select-all, so either one keeps the current choice.
 */
export function toCatalogChoice(selection: Selection, current: string): string {
  if (selection === 'all') {
    return current;
  }
  const [first] = selection;
  return first === undefined ? current : String(first);
}

/**
 * Reads the Status or Type group's selection. The group offers an All tag
 * beside its values: picking All clears the group, and picking a value while
 * All is shown replaces it.
 */
export function toCatalogGroupValues(selection: Selection, current: readonly string[]): readonly string[] {
  if (selection === 'all') {
    return current;
  }
  const picked = Array.from(selection, String);
  if (current.length > 0 && picked.includes(CATALOG_FILTER_ALL_VALUE)) {
    return [];
  }
  return picked.filter((value) => value !== CATALOG_FILTER_ALL_VALUE);
}

/** The tags a Status or Type group shows selected: All while the group is empty. */
export function toCatalogGroupKeys(values: readonly string[]): readonly string[] {
  return values.length === 0 ? [CATALOG_FILTER_ALL_VALUE] : values;
}

/** Reads the Genres group's selection, in the order the genres were picked. */
export function toCatalogGenres(selection: Selection, current: readonly string[]): readonly string[] {
  return selection === 'all' ? current : Array.from(selection, String);
}

/** Genre filter options discovered from the catalog: trimmed, unique and alphabetical. */
export function getCatalogGenreOptions(items: readonly Anime[]): readonly CatalogOption[] {
  const genres = new Set(items.flatMap((item) => item.genres.map((genre) => genre.trim())).filter(Boolean));
  return Array.from(genres)
    .sort((a, b) => a.localeCompare(b))
    .map((genre) => ({ value: genre, label: genre }));
}

/**
 * Chip color of an `estado`: watching is accent, finished success, dropped
 * danger and paused warning. Colors are presentation and stay feature-local.
 */
export function getCatalogStatusColor(status: number): CatalogStatusColor {
  const colorByStatus: Record<number, CatalogStatusColor> = {
    [ANIME_ESTADO_VALID_VALUES[0]]: 'accent',
    [ANIME_ESTADO_VALID_VALUES[1]]: 'success',
    [ANIME_ESTADO_VALID_VALUES[2]]: 'danger',
    [ANIME_ESTADO_VALID_VALUES[3]]: 'warning',
  };
  return colorByStatus[status] ?? 'default';
}

/** Accessible name of the Filters button, counting the active filters. */
export function formatCatalogFiltersLabel(activeFilterCount: number): string {
  return activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : 'Filters';
}

/** Label of the action that closes the Filters popover onto the result. */
export function formatCatalogShowLabel(matchingCount: number): string {
  return `Show ${matchingCount} anime`;
}

/** Results footer: how many the progressive window still hides, or the end of the catalog. */
export function formatCatalogFooter(renderedCount: number, matchingCount: number): string {
  return renderedCount < matchingCount ? `Showing ${renderedCount} of ${matchingCount} — scroll for more` : CATALOG_END_LABEL;
}

/** Route of one anime's detail, shared with History. */
export function toCatalogDetailPath(animeId: string): string {
  return `/catalog/detail/${animeId}`;
}

/** Converts a runtime record into the labels one Catalog card or row renders. */
export function toCatalogItemViewModel(anime: Anime): CatalogItemViewModel {
  const kindLabel = getAnimeTipoLabel(anime.kind);
  return {
    id: anime.id,
    name: anime.name,
    hasCover: anime.hasCover,
    statusLabel: getAnimeEstadoLabel(anime.status),
    statusColor: getCatalogStatusColor(anime.status),
    kindLabel,
    listMeta: [kindLabel, anime.genres.join(', ')].filter(Boolean).join(' · '),
  };
}

/**
 * Decides what one cover slot draws. A record with a stored cover shows a
 * skeleton until its lookup answers, so the poster never flashes in before the
 * real art; every way of not getting art (no stored cover, no binding, a
 * placeholder answer, a failed lookup or decode) ends on the poster.
 */
export function toCatalogCover(input: CatalogCoverInput): CatalogCover {
  if (!input.hasCover || !input.canResolve || input.hasFailed) {
    return { status: 'placeholder' };
  }
  if (input.entry === undefined || input.entry.status === 'loading') {
    return { status: 'loading' };
  }
  return input.entry.status === 'cover' ? { status: 'cover', src: input.entry.dataUrl } : { status: 'placeholder' };
}

/**
 * Tells an empty catalog apart from a catalog the user has filtered down to
 * nothing, and refuses to classify either one before the request has actually
 * resolved. A failed read is not an empty catalog: inviting the user to create
 * anime because a binding was unavailable is how duplicates get made.
 */
export function classifyCatalogEmptyState(input: CatalogEmptyStateInput): CatalogEmptyState {
  if (input.isLoading || input.hasError) {
    return 'none';
  }
  if (input.sourceCount === 0) {
    return 'actual';
  }
  if (input.visibleCount > 0) {
    return 'none';
  }
  return hasActiveCatalogCriteria(input.criteria) ? 'criteria' : 'none';
}
