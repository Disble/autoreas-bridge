/**
 * Canonical Legacy anime `estado` vocabulary — the single source of truth for
 * how estado values are worded across every feature (History, Catalog,
 * AnimeDetail, Chapters). Values and labels are Legacy's own domain vocabulary,
 * confirmed against Legacy's Historial UI: 0=Viendo, 1=Finalizado,
 * 2=No me gusto, 3=En pausa. Kept as Spanish data literals (like the Estrenos
 * section names "Sin ver"/"Ver hoy"/"Visto"), not translated UI copy.
 *
 * This module is a deliberate, scoped exception to the per-feature colocation
 * convention: the vocabulary lives in ONE place so a future rewording is a
 * one-file change. Chip/state COLORS stay feature-local (they are presentation,
 * not vocabulary).
 */
export const ANIME_ESTADO_LABELS: Readonly<Record<number, string>> = {
  0: 'Viendo',
  1: 'Finalizado',
  2: 'No me gusto',
  3: 'En pausa',
};

/**
 * The four numeric estado values as `{ value, label }` filter entries in
 * canonical order. Shaped to be structurally compatible with each feature's
 * own filter-option type; features prepend their own "All" sentinel entry.
 */
export const ANIME_ESTADO_FILTER_ENTRIES: readonly { value: string; label: string }[] = [
  { value: '0', label: ANIME_ESTADO_LABELS[0] },
  { value: '1', label: ANIME_ESTADO_LABELS[1] },
  { value: '2', label: ANIME_ESTADO_LABELS[2] },
  { value: '3', label: ANIME_ESTADO_LABELS[3] },
];
