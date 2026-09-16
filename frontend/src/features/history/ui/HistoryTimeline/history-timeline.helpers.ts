import type { Anime } from '../../../../shared/contracts/anime.types';
import { getAnimeEstadoLabel } from '../../../../shared/helpers/anime-estado.helpers';
import type { HistoryDayGroup } from '../../../../shared/watch-history/watch-history.types';
import type { HistoryAnimeScope } from '../HistoryFilterBar/history-filter-bar.types';
import type { HistoryStatusChipColor, HistoryTimelineEntry, HistoryTimelineGroup } from './history-timeline.types';

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
