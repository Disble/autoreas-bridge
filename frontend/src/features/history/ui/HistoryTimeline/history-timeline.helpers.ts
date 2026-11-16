import type { Anime, WatchHistoryPageRequest } from '../../../../shared/contracts/anime.types';
import { getAnimeEstadoLabel } from '../../../../shared/helpers/anime-estado.helpers';
import { toAsyncView } from '../../../../shared/query/async-view/async-view.helpers';
import type { AsyncViewSource } from '../../../../shared/query/async-view/async-view.types';
import type { HistoryDayGroup } from '../../../../shared/watch-history/watch-history.types';
import type { HistoryAnimeScope } from '../HistoryFilterBar/history-filter-bar.types';
import { toLocalDayRangeMs } from '../HistoryFilterBar/history-params.helpers';
import { HISTORY_TIMELINE_NO_ENTRIES } from './history-timeline.constants';
import type {
  HistoryCatalogLoad,
  HistoryStatusChipColor,
  HistoryTimelineEntry,
  HistoryTimelineFilters,
  HistoryTimelineGroup,
  HistoryTimelinePages,
  HistoryTimelinePagesInput,
} from './history-timeline.types';

/** Maps a current anime status to History's local semantic Chip color. */
export function getHistoryStatusColor(status: number): HistoryStatusChipColor {
  switch (status) {
    case 0:
      return 'accent';
    case 1:
      return 'success';
    case 2:
      return 'danger';
    case 3:
      return 'warning';
    default:
      return 'default';
  }
}

/** Enriches history rows with catalog status presentation, leaving deleted animes chipless. */
export function toHistoryTimelineGroups(groups: readonly HistoryDayGroup[], catalog: readonly Anime[]): readonly HistoryTimelineGroup[] {
  const animeById = new Map(catalog.map((anime) => [anime.id, anime]));

  return groups.map((group) => ({
    ...group,
    entries: group.entries.map((entry) => {
      const anime = animeById.get(entry.animeId);

      return anime === undefined ? entry : {
        ...entry,
        statusLabel: getAnimeEstadoLabel(anime.status),
        statusColor: getHistoryStatusColor(anime.status),
      };
    }),
  }));
}

/** Finds the loaded row a `ListBox` key names, across every loaded day. */
export function findHistoryTimelineEntry(groups: readonly HistoryTimelineGroup[], key: string | number | undefined): HistoryTimelineEntry | undefined {
  return groups.flatMap((group) => group.entries).find((entry) => entry.id === key);
}

/**
 * Resolves the row an open gesture (Enter, double-click) landed on from the
 * DOM event target: React Aria renders `data-key` on every option, so the
 * gesture opens the row under the cursor even when the URL-round-tripped
 * selection has not settled yet (a double-click's two clicks outrun it).
 * Returns `undefined` when the target names no loaded row; the caller keeps
 * the settled selection as the fallback.
 */
export function resolveEventRowKey(target: unknown, groups: readonly HistoryTimelineGroup[]): number | undefined {
  if (target === null || typeof target !== 'object') {
    return undefined;
  }
  const closest = (target as Element).closest;
  if (typeof closest !== 'function') {
    return undefined;
  }
  const option = closest.call(target, '[data-key]');
  if (option === null || typeof option !== 'object') {
    return undefined;
  }
  const raw = (option as Element).getAttribute?.('data-key');
  if (typeof raw !== 'string') {
    return undefined;
  }

  return groups.flatMap((group) => group.entries).find((entry) => String(entry.id) === raw)?.id;
}

/**
 * Resolves the highlighted row from the URL selection (design D5): `rowId`
 * when that row is loaded and belongs to `animeId`, else the anime's first
 * loaded row, else nothing -- the inspector still shows the anime.
 */
export function resolveHistorySelectedKey(
  groups: readonly HistoryTimelineGroup[],
  animeId: string | undefined,
  rowId: number | undefined,
): number | undefined {
  const animeEntries = groups.flatMap((group) => group.entries).filter((entry) => entry.animeId === animeId);

  return (animeEntries.find((entry) => entry.id === rowId) ?? animeEntries[0])?.id;
}

/**
 * Resolves which animes an active Status/Type filter narrows the history
 * read to (design D2). Status and Type filter by the anime's CURRENT
 * catalog state, never the state recorded at watch time.
 * @param catalog The full anime catalog, loaded once per History visit.
 * @param status The active Status filter, or `undefined` for "All".
 * @param type The active Type filter, or `undefined` for "All".
 * @returns `'all'` when neither filter narrows; `'ids'` with the matching
 * set when at least one anime matches; `'none'` when the filter matches
 * nothing -- the caller must render the filtered-empty state and skip the
 * watch-history read entirely.
 */
export function resolveHistoryAnimeScope(
  catalog: readonly Anime[],
  status: number | undefined,
  type: number | undefined,
): HistoryAnimeScope {
  if (status === undefined && type === undefined) {
    return { kind: 'all' };
  }

  const ids = catalog
    .filter((anime) => (status === undefined || anime.status === status) && (type === undefined || anime.kind === type))
    .map((anime) => anime.id);

  return ids.length === 0 ? { kind: 'none' } : { kind: 'ids', ids };
}

/**
 * Builds the page request for the given filters and Status/Type scope (design
 * D2, D4): an `'ids'` scope narrows the read to that anime set; `'all'` sends
 * an empty `animeIds`. The watched range goes out as half-open local-day
 * millis, `0`/`0` when unbounded.
 *
 * @param filters The URL filters.
 * @param scope The resolved scope; `'none'` is never read.
 * @param cursor The keyset cursor, `''` for the first page.
 * @returns The page request.
 */
export function buildHistoryPageRequest(filters: HistoryTimelineFilters, scope: HistoryAnimeScope, cursor: string): WatchHistoryPageRequest {
  const [watchedFromMs, watchedToMs] = filters.range === undefined ? [0, 0] : toLocalDayRangeMs(filters.range.from, filters.range.to);

  return {
    search: filters.search,
    animeIds: scope.kind === 'ids' ? scope.ids : [],
    watchedFromMs,
    watchedToMs,
    order: filters.order,
    cursor,
    limit: 0,
  };
}

/**
 * The first-page request of the timeline, or undefined when no page is read:
 * the catalog has not resolved the scope yet, or the Status/Type filter
 * matches nothing (design D2), which renders the filtered-empty state without
 * spending a binding call.
 *
 * @param filters The URL filters.
 * @param scope The resolved scope, or undefined until the catalog loads.
 * @returns The first-page request, or undefined.
 */
export function toHistoryFirstPageRequest(filters: HistoryTimelineFilters, scope: HistoryAnimeScope | undefined): WatchHistoryPageRequest | undefined {
  return scope === undefined || scope.kind === 'none' ? undefined : buildHistoryPageRequest(filters, scope, '');
}

/**
 * Derives what the timeline shows: a catalog failure fails it; a scope that
 * matches nothing is resolved and empty; it stays loading until the scope
 * resolves and while the first page is pending (including while the anime
 * module starts) or still shows the previous request's rows; a first-page
 * failure surfaces as `error` with no rows (design D9); otherwise the first
 * page's rows followed by the older pages loaded for this same request and
 * first-page load.
 *
 * @param input The catalog state, the first-page query and the older pages.
 * @returns The rows, the loading and failure state and the next cursor.
 */
export function toHistoryTimelinePages({ catalogError, scope, firstPage, older, requestKey }: HistoryTimelinePagesInput): HistoryTimelinePages {
  const nothing = { entries: HISTORY_TIMELINE_NO_ENTRIES, cursor: undefined };
  if (catalogError !== undefined) {
    return { ...nothing, isLoading: false, error: catalogError };
  }
  if (scope?.kind === 'none') {
    return { ...nothing, isLoading: false, error: undefined };
  }
  if (scope === undefined) {
    return { ...nothing, isLoading: true, error: undefined };
  }

  const view = toAsyncView(firstPage, () => false);
  if (view.kind === 'failure') {
    return { ...nothing, isLoading: false, error: new Error(view.message) };
  }
  if (view.kind !== 'ready' || firstPage.isPlaceholderData) {
    return { ...nothing, isLoading: true, error: undefined };
  }

  const continues = older?.requestKey === requestKey && older?.firstPageAt === firstPage.dataUpdatedAt;
  return continues && older !== undefined
    ? { entries: older.entries, isLoading: false, error: undefined, cursor: older.nextCursor }
    : { entries: view.data.items, isLoading: false, error: undefined, cursor: view.data.nextCursor };
}

/**
 * Reads the catalog query as History consumes it: the loaded catalog, or the
 * failure with its message (also while the anime module failed), so History
 * never renders a failed catalog read as an empty history.
 *
 * @param query The catalog query's result.
 * @returns The catalog, or the failure; both undefined while loading.
 */
export function toHistoryCatalogLoad(query: AsyncViewSource<readonly Anime[]>): HistoryCatalogLoad {
  const view = toAsyncView(query, () => false);
  return {
    catalog: view.kind === 'ready' ? view.data : undefined,
    error: view.kind === 'failure' ? new Error(view.message) : undefined,
  };
}
