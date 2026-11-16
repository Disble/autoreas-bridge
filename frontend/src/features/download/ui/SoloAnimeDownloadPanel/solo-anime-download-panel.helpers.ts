import { toErrorMessage } from '../../../../shared/helpers/error-message.helpers';
import type { AsyncView } from '../../../../shared/query/async-view/async-view.types';
import type { AnimeDownloadReadiness, DownloadReadinessSnapshot } from '../../../../shared/contracts/download.types';
import { getDownloadReadinessReasonLabel } from '../../../../shared/constants/download-readiness';
import {
  SOLO_ANIME_DOWNLOAD_GENERIC_BLOCKED_TAG,
  SOLO_ANIME_DOWNLOAD_IN_PROGRESS_MESSAGE,
  SOLO_ANIME_DOWNLOAD_NO_ITEMS,
  SOLO_ANIME_DOWNLOAD_REASON_TAGS,
} from './solo-anime-download-panel.constants';
import type {
  SoloAnimeDownloadCounts,
  SoloAnimeDownloadFilter,
  SoloAnimeDownloadOptionViewModel,
  SoloAnimeDownloadState,
  SoloAnimeDownloadStatus,
} from './solo-anime-download-panel.types';

/** Derives the displayed status without losing a previous action result. */
export function soloReadinessStatus(kind: AsyncView<unknown>['kind'], status: SoloAnimeDownloadStatus, errorMessage: string | undefined, error: unknown) {
  if (kind === 'loading') return { status: 'loading' as const, errorMessage };
  if (kind === 'failure') return { status: 'readiness-error' as const, errorMessage: toErrorMessage(error, 'Failed to load animes') };
  return { status, errorMessage };
}

/** Tests whether a catalog item matches the normalized search. */
function matchesQuery(item: AnimeDownloadReadiness, normalizedQuery: string): boolean {
  return normalizedQuery.length === 0 || item.name.toLowerCase().includes(normalizedQuery);
}

/**
 * Builds the compact tag for a row's fixed-width status column. Ready rows get
 * no tag: readiness is a boolean, so a badge every ready row shares carries no
 * information, and absence is the clearer signal. Several blockers collapse to a
 * count rather than a list, because the row has one slot and the selection alert
 * already spells every reason out in full.
 */
export function getSoloAnimeDownloadStatusTag(anime: AnimeDownloadReadiness): string | undefined {
  if (anime.ready) {
    return undefined;
  }
  if (anime.reasons.length === 0) {
    return SOLO_ANIME_DOWNLOAD_GENERIC_BLOCKED_TAG;
  }
  if (anime.reasons.length > 1) {
    return `${anime.reasons.length} issues`;
  }
  return SOLO_ANIME_DOWNLOAD_REASON_TAGS[anime.reasons[0]];
}

/**
 * Maps one backend readiness item into the row model rendered by Solo Download.
 */
export function toSoloAnimeDownloadOption(anime: AnimeDownloadReadiness): SoloAnimeDownloadOptionViewModel {
  return {
    id: anime.animeId,
    name: anime.name,
    ready: anime.ready,
    reasonLabels: anime.reasons.map(getDownloadReadinessReasonLabel),
    statusTag: getSoloAnimeDownloadStatusTag(anime),
  };
}

/**
 * Filters the catalog to one side of the readiness partition, applies the search,
 * and sorts by name. Ready and blocked are disjoint, so the two tabs never show
 * the same anime twice.
 */
export function getSoloAnimeDownloadOptions(
  items: readonly AnimeDownloadReadiness[],
  query: string,
  filter: SoloAnimeDownloadFilter,
): readonly SoloAnimeDownloadOptionViewModel[] {
  const normalizedQuery = query.trim().toLowerCase();

  return items
    .filter((item) => item.ready === (filter === 'ready') && matchesQuery(item, normalizedQuery))
    .toSorted((a, b) => a.name.localeCompare(b.name) || a.animeId.localeCompare(b.animeId))
    .map(toSoloAnimeDownloadOption);
}

/**
 * Counts both sides of the partition under the active search, so the tab labels
 * describe what the user would actually find after switching.
 */
export function countSoloAnimeDownloadReadiness(
  items: readonly AnimeDownloadReadiness[],
  query: string,
): SoloAnimeDownloadCounts {
  const normalizedQuery = query.trim().toLowerCase();
  const matching = items.filter((item) => matchesQuery(item, normalizedQuery));

  return {
    ready: matching.filter((item) => item.ready).length,
    blocked: matching.filter((item) => !item.ready).length,
  };
}

/**
 * Explains an empty rail. When a search matched only on the other tab, the
 * message says so and names the count, so the partition never hides a result.
 */
export function getSoloAnimeDownloadEmptyMessage(
  filter: SoloAnimeDownloadFilter,
  query: string,
  counts: SoloAnimeDownloadCounts,
): string {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) {
    return filter === 'ready' ? 'No anime is ready for a download check.' : 'No anime is blocked.';
  }

  const otherCount = filter === 'ready' ? counts.blocked : counts.ready;
  if (otherCount === 0) {
    return `No anime match "${trimmedQuery}".`;
  }

  const otherLabel = filter === 'ready' ? 'blocked' : 'ready';
  const matchWord = otherCount === 1 ? 'match' : 'matches';
  return `No ${filter} anime match "${trimmedQuery}" — ${otherCount} ${otherLabel} ${matchWord}.`;
}

/** Resolves the picked anime against the whole catalog, so a tab or search never drops it. */
export function findSoloAnimeDownloadSelection(
  items: readonly AnimeDownloadReadiness[],
  selectedAnimeID: string | undefined,
): SoloAnimeDownloadOptionViewModel | undefined {
  const item = items.find((candidate) => candidate.animeId === selectedAnimeID);
  return item === undefined ? undefined : toSoloAnimeDownloadOption(item);
}

/** Maps the tab control value to a filter; anything but `blocked` shows the ready tab. */
export function toSoloAnimeDownloadFilter(value: string): SoloAnimeDownloadFilter {
  return value === 'blocked' ? 'blocked' : 'ready';
}

/** The state after a failed trigger: an already running download is its own outcome, any other failure keeps its message. */
export function toSoloTriggerFailureState(previous: SoloAnimeDownloadState, error: unknown): SoloAnimeDownloadState {
  const message = toErrorMessage(error, 'Failed to start anime download');
  if (message === SOLO_ANIME_DOWNLOAD_IN_PROGRESS_MESSAGE) {
    return { ...previous, status: 'already-in-progress' };
  }
  return { ...previous, status: 'trigger-error', errorMessage: message };
}

/** The catalog rows to list: the read's items once it is ready, no anime while it loads or failed. */
export function soloReadinessItems(
  view: AsyncView<Pick<DownloadReadinessSnapshot, 'items'>>,
): readonly AnimeDownloadReadiness[] {
  return view.kind === 'ready' ? view.data.items : SOLO_ANIME_DOWNLOAD_NO_ITEMS;
}

/** Whether the trigger is offered: a ready pick and no trigger already running. */
export function canTriggerSoloDownload(
  selected: SoloAnimeDownloadOptionViewModel | undefined,
  status: SoloAnimeDownloadStatus,
): boolean {
  return selected?.ready === true && status !== 'triggering';
}
