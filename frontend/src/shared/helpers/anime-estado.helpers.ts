import { ANIME_ESTADO_LABELS } from '../constants/anime-estado.constants';

/**
 * Returns the canonical label for an anime `estado`, falling back to the raw
 * value as a string for any unrecognized number rather than inventing a label.
 */
export function getAnimeEstadoLabel(estado: number): string {
  return ANIME_ESTADO_LABELS[estado] ?? String(estado);
}
