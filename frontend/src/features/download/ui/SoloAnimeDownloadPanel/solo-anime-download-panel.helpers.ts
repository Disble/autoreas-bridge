import type { AnimeDownloadReadiness } from '../../../../shared/contracts/download.types';
import { getDownloadReadinessReasonLabel } from '../../../../shared/constants/download-readiness';
import {
  SOLO_ANIME_DOWNLOAD_GENERIC_BLOCKED_TAG,
  SOLO_ANIME_DOWNLOAD_REASON_TAGS,
} from './solo-anime-download-panel.constants';
import type {
  SoloAnimeDownloadCounts,
  SoloAnimeDownloadFilter,
  SoloAnimeDownloadOptionViewModel,
} from './solo-anime-download-panel.types';

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
