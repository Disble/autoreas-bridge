import { ANIME_ESTADO_LABELS, ANIME_ESTADO_VALID_VALUES } from '../constants/anime-estado.constants';
import type { AnimeEstadoStatus } from './anime-estado.helpers.types';

/**
 * Returns the canonical label for an anime `estado`, falling back to the raw
 * value as a string for any unrecognized number rather than inventing a label.
 */
export function getAnimeEstadoLabel(estado: number): string {
  return ANIME_ESTADO_LABELS[estado] ?? String(estado);
}

/**
 * Returns true when the anime is currently being watched: `activo === 1` and
 * `estado === 0` (Viendo). Centralizes the feature-local "watching" predicate
 * so future estado vocabulary changes are a one-module edit.
 */
export function isWatchingAnime(anime: AnimeEstadoStatus): boolean {
  return anime.activo === 1 && anime.estado === 0;
}

/**
 * Returns true when the supplied estado is one of the canonical Legacy values
 * (0..3). Centralizes the magic-number set so the editor form, validators, and
 * any future surface share one source of truth.
 */
export function isValidAnimeEstado(estado: number): boolean {
  return ANIME_ESTADO_VALID_VALUES.includes(estado);
}
