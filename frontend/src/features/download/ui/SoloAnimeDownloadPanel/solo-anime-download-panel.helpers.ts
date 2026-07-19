import type { Anime } from '../../../../shared/contracts/anime.types';
import type { SoloAnimeDownloadOptionViewModel } from './solo-anime-download-panel.types';
import { SOLO_ANIME_DOWNLOAD_MAX_RESULTS } from './solo-anime-download-panel.constants';

/**
 * Formats the current-vs-total episode progress shown next to an anime option,
 * so the user can recognize what will be caught up before pressing Download.
 */
export function formatSoloAnimeProgress(current: number, total?: number): string {
  return total === undefined ? `${current} / ?` : `${current} / ${total}`;
}

/**
 * Returns the missing prerequisite label that blocks an actual download run.
 * The backend can still accept the request, but surfacing the gap here prevents
 * the user from launching a knowingly skipped anime.
 */
export function getSoloAnimeDownloadGapLabel(anime: Anime): string | undefined {
  if (!anime.hasDownloadPage && !anime.hasFolder) {
    return 'Missing page & folder';
  }
  if (!anime.hasDownloadPage) {
    return 'Missing page';
  }
  if (!anime.hasFolder) {
    return 'Missing folder';
  }
  return undefined;
}

/**
 * Maps an Anime DTO into the small selector row view model used by the solo
 * download panel.
 */
export function toSoloAnimeDownloadOption(anime: Anime): SoloAnimeDownloadOptionViewModel {
  const gapLabel = getSoloAnimeDownloadGapLabel(anime);

  return {
    id: anime.id,
    name: anime.nombre,
    progressLabel: formatSoloAnimeProgress(anime.nrocapvisto, anime.totalcap),
    canDownload: anime.activo === 1 && gapLabel === undefined,
    gapLabel,
  };
}

/**
 * Filters by anime name, sorts by name, and caps the rendered selector rows so
 * the Downloads page remains compact even with a large catalog.
 */
export function getSoloAnimeDownloadOptions(
  items: readonly Anime[],
  query: string,
): readonly SoloAnimeDownloadOptionViewModel[] {
  const normalizedQuery = query.trim().toLowerCase();

  return items
    .filter((item) => normalizedQuery.length === 0 || item.nombre.toLowerCase().includes(normalizedQuery))
    .toSorted((a, b) => a.nombre.localeCompare(b.nombre) || a.id.localeCompare(b.id))
    .slice(0, SOLO_ANIME_DOWNLOAD_MAX_RESULTS)
    .map(toSoloAnimeDownloadOption);
}
