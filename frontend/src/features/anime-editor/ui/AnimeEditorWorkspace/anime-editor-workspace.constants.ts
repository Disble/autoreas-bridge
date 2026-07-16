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

/** Toggle metadata for the left-rail watching-first filter. */
export const ANIME_EDITOR_FILTER_OPTIONS = [
  { id: 'watching', label: 'Watching first' },
  { id: 'all', label: 'All anime' },
] as const;

/** Rows rendered initially; the list grows by ANIME_EDITOR_LIST_LOAD_BATCH on scroll. */
export const ANIME_EDITOR_LIST_INITIAL_COUNT = 20;

/** Extra rows appended each time the user scrolls near the bottom of the rail. */
export const ANIME_EDITOR_LIST_LOAD_BATCH = 20;

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
