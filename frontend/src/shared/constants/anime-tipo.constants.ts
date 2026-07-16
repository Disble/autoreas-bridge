/**
 * Canonical Legacy anime `tipo` (kind) vocabulary — the single source of truth
 * for how the numeric type value is worded across every feature (Catalog filter,
 * anime editor "Type" Select, and any future surface). Values are Legacy's own
 * canonical numeric `tipo` (0=Anime (TV), 1=Película, 2=Especial, 3=OVA) and the
 * labels are Legacy data literals kept verbatim, not translated UI copy (ADR-007).
 *
 * This module mirrors `anime-estado.constants.ts`: a deliberate, scoped exception
 * to per-feature colocation so the vocabulary lives in ONE place and a future
 * rewording is a one-file change. `tipo` is a CLOSED enum of four fixed values,
 * not an open domain like `dias`/`generos`, so its options are static — never
 * discovered dynamically from the catalog data.
 *
 * Only {@link ANIME_TIPO_FILTER_ENTRIES} is exported today because it is the
 * one shape consumers need. The label map and value list stay module-private
 * until a surface needs them directly; that slice exports them with its own
 * consumer so no dead export ships (mirrors the estado module's live exports).
 */
const ANIME_TIPO_LABELS: Readonly<Record<number, string>> = {
  0: 'Anime (TV)',
  1: 'Película',
  2: 'Especial',
  3: 'OVA',
};

/** The four canonical numeric `tipo` values in Legacy-truth order. */
const ANIME_TIPO_VALID_VALUES: readonly number[] = [0, 1, 2, 3] as const;

/**
 * The four numeric `tipo` values as `{ value, label }` entries in canonical
 * Legacy order. Values are the numeric `tipo` as a string so they match against
 * `String(item.tipo)`; labels come from {@link ANIME_TIPO_LABELS}. Structurally
 * compatible with each feature's own option type. The editor's mandatory "Type"
 * Select consumes these as-is; filter surfaces prepend their own "All" sentinel.
 */
export const ANIME_TIPO_FILTER_ENTRIES: readonly { value: string; label: string }[] =
  ANIME_TIPO_VALID_VALUES.map((value) => ({ value: String(value), label: ANIME_TIPO_LABELS[value] }));
