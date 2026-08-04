import type { AnimeDownloadReadiness } from '../../../../shared/contracts/download.types';
import { getDownloadReadinessReasonLabel } from '../../../../shared/constants/download-readiness';
import type { SoloAnimeDownloadOptionViewModel } from './solo-anime-download-panel.types';

/**
 * Maps one backend readiness item into the row model rendered by Solo Download.
 */
export function toSoloAnimeDownloadOption(anime: AnimeDownloadReadiness): SoloAnimeDownloadOptionViewModel {
  return { id: anime.animeId, name: anime.name, ready: anime.ready, reasonLabels: anime.reasons.map(getDownloadReadinessReasonLabel) };
}

/**
 * Filters and sorts the complete backend catalog while retaining blocked rows.
 */
export function getSoloAnimeDownloadOptions(
  items: readonly AnimeDownloadReadiness[],
  query: string,
): readonly SoloAnimeDownloadOptionViewModel[] {
  const normalizedQuery = query.trim().toLowerCase();

  return items
    .filter((item) => normalizedQuery.length === 0 || item.name.toLowerCase().includes(normalizedQuery))
    .toSorted((a, b) => a.name.localeCompare(b.name) || a.animeId.localeCompare(b.animeId))
    .map(toSoloAnimeDownloadOption);
}
