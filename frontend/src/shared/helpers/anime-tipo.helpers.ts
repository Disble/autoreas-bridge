import { ANIME_TIPO_LABELS } from "../constants/anime-tipo.constants";

/**
 * Returns the canonical label for an anime `tipo`, mirroring
 * `getAnimeDetailTipoLabel`'s contract: an absent `tipo` degrades to
 * "Unknown" and an unrecognized value falls back to its raw string rather
 * than inventing a label.
 */
export function getAnimeTipoLabel(tipo?: number): string {
  if (tipo === undefined) {
    return "Unknown";
  }

  return ANIME_TIPO_LABELS[tipo] ?? String(tipo);
}
