import { ANIME_ESTADO_LABELS, ANIME_ESTADO_VALID_VALUES } from '../../../../shared/constants/anime-estado.constants';
import type { AnimeEditorDraft, AnimeEditorStatusOption } from './anime-editor-workspace.types';

/** Default empty draft used before the first editor record loads. */
export const ANIME_EDITOR_DEFAULT_DRAFT: AnimeEditorDraft = {
  name: '',
  status: ANIME_ESTADO_VALID_VALUES[0],
  progress: '',
  totalEpisodes: '',
  kind: '',
  page: '',
  folder: '',
  premieredAt: '',
  origin: '',
  duration: '',
  genres: '',
  studios: '',
  coverType: 'url',
  coverPath: '',
};

/**
 * Toggle metadata for the left-rail filter. "Watching now" is the set of animes
 * active for consumption — the same animes that appear on the Daily schedule
 * board (active + at least one scheduled day), not only Viendo. The `id` stays
 * `watching` for route/state compatibility; only the label reflects the wider
 * meaning.
 */
export const ANIME_EDITOR_FILTER_OPTIONS = [
  { id: 'watching', label: 'Watching now' },
  { id: 'all', label: 'All anime' },
] as const;

/** Rows rendered initially; the list grows by ANIME_EDITOR_LIST_LOAD_BATCH on scroll. */
export const ANIME_EDITOR_LIST_INITIAL_COUNT = 20;

/** Extra rows appended each time the user scrolls near the bottom of the rail. */
export const ANIME_EDITOR_LIST_LOAD_BATCH = 20;

/**
 * Required anime Type options for Legacy's Editar dropdown, in canonical order.
 * Re-exported from the shared `tipo` vocabulary (`shared/constants/anime-tipo.constants.ts`)
 * so the Catalog filter and this editor Select share one source of truth. Type
 * is mandatory — there is deliberately no empty/"All" option here.
 */
export { ANIME_TIPO_FILTER_ENTRIES as ANIME_EDITOR_KIND_OPTIONS } from '../../../../shared/constants/anime-tipo.constants';

/** Cover source options mirroring Legacy's external-URL vs on-disk-image choice. */
export const ANIME_EDITOR_COVER_TYPE_OPTIONS = [
  { value: 'url', label: 'URL' },
  { value: 'image', label: 'Image' },
] as const;

/** Canonical estado options for the status Select in Legacy vocabulary order. */
export const ANIME_EDITOR_STATUS_OPTIONS: readonly AnimeEditorStatusOption[] = ANIME_ESTADO_VALID_VALUES.map((value) => ({
  value,
  label: ANIME_ESTADO_LABELS[value] ?? String(value),
}));
