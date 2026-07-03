import type { AnimeDetail, AnimeRepeticion } from '../../../../shared/contracts/anime.types';
import { ANIME_DETAIL_UNKNOWN_LABEL } from './anime-detail.constants';
import type { AnimeDetailViewModel, AnimeRepeticionViewModel } from './anime-detail.types';

/**
 * Builds a human-readable progress label from the current and total episode
 * counters. Falls back to "?" when the total is missing, mirroring the
 * Catalog panel's progress formatting.
 */
export function formatAnimeDetailProgress(current: number, total?: number): string {
  return total === undefined ? `${current} / ?` : `${current} / ${total}`;
}

/**
 * Formats an epoch-millis date into a stable `YYYY-MM-DD` label. Returns
 * `undefined` when the millis are missing, so callers can render a fallback.
 */
export function formatAnimeDetailDate(millis?: number): string | undefined {
  if (millis === undefined) {
    return undefined;
  }

  return new Date(millis).toISOString().slice(0, 10);
}

/**
 * Maps a single legacy repetition entry into its display view model. Missing
 * `fechaRepeticion` (legacy null date) degrades to the "Unknown" label rather
 * than omitting the entry.
 */
export function toAnimeRepeticionViewModel(
  entry: AnimeRepeticion,
  index: number,
): AnimeRepeticionViewModel {
  return {
    key: `${entry.numrepeticion}-${index}`,
    numRepeticion: entry.numrepeticion,
    progressLabel: formatAnimeDetailProgress(entry.nrocapvisto),
    repeatedOnLabel: formatAnimeDetailDate(entry.fechaRepeticion) ?? ANIME_DETAIL_UNKNOWN_LABEL,
  };
}

/**
 * Converts the `AnimeDetail` DTO into the view model rendered by the shared
 * detail component. `repetir` is optional on the wire (Go's `omitempty` drops
 * the key for the ~93% of anime with no repetition history), so it MUST be
 * defaulted with `?? []` here rather than assumed present.
 */
export function toAnimeDetailViewModel(detail: AnimeDetail): AnimeDetailViewModel {
  const repetitions = (detail.repetir ?? []).map(toAnimeRepeticionViewModel);

  return {
    id: detail._id,
    nombre: detail.nombre,
    progressLabel: formatAnimeDetailProgress(detail.nrocapvisto, detail.totalcap),
    genres: detail.generos,
    studios: detail.estudios ?? ANIME_DETAIL_UNKNOWN_LABEL,
    origin: detail.origen ?? ANIME_DETAIL_UNKNOWN_LABEL,
    isFirstWatch: detail.primeravez === 1,
    repetitions,
    hasRepetitionHistory: repetitions.length > 0,
  };
}
