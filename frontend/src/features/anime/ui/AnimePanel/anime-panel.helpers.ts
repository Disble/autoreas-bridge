import type { Anime } from '../../../../shared/contracts/anime.types';
import {
  ANIME_STATUS_ACTIVE_LABEL,
  ANIME_STATUS_INACTIVE_LABEL,
} from './anime-panel.constants';
import type { AnimeStatus, AnimeViewModel } from './anime-panel.types';

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
 * Converts a runtime Anime DTO into the view model rendered by AnimePanel.
 */
export function toAnimeViewModel(anime: Anime): AnimeViewModel {
  const status = toAnimeStatus(anime.activo);

  return {
    id: anime.id,
    nombre: anime.nombre,
    estado: anime.estado,
    progressLabel: formatAnimeProgress(anime.nrocapvisto, anime.totalcap),
    status,
    statusLabel: status === 'active' ? ANIME_STATUS_ACTIVE_LABEL : ANIME_STATUS_INACTIVE_LABEL,
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
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
