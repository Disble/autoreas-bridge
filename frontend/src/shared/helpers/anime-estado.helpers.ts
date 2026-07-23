import { ANIME_ESTADO_LABELS, ANIME_ESTADO_VALID_VALUES } from '../constants/anime-estado.constants';
import type { AnimeScheduleMembership } from './anime-estado.helpers.types';

/**
 * Returns the canonical label for an anime `estado`, falling back to the raw
 * value as a string for any unrecognized number rather than inventing a label.
 */
export function getAnimeEstadoLabel(estado: number): string {
  return ANIME_ESTADO_LABELS[estado] ?? String(estado);
}

/**
 * Returns true when the anime appears on the Daily schedule board: it is active
 * in the catalog (`active === 1`) and has at least one scheduled weekday. This
 * mirrors the Go `ListEpisodeSchedule` read model, which shows every active
 * anime with a matching day regardless of `status` — so a paused (En pausa)
 * anime that is still scheduled belongs here, unlike the narrower
 * `isWatchingAnime` (Viendo-only). It is the "active for consumption" predicate
 * behind the editor's "Watching now" rail.
 */
export function isScheduledAnime(anime: AnimeScheduleMembership): boolean {
  return anime.active === 1 && anime.days.length > 0;
}

/**
 * Returns true when the supplied estado is one of the canonical Legacy values
 * (0..3). Centralizes the magic-number set so the editor form, validators, and
 * any future surface share one source of truth.
 */
export function isValidAnimeEstado(estado: number): boolean {
  return ANIME_ESTADO_VALID_VALUES.includes(estado);
}
