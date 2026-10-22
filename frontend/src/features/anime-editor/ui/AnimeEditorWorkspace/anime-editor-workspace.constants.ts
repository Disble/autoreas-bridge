import type { AnimeCoverEntry } from '../../../../shared/anime-cover/use-anime-cover';
import { ANIME_ESTADO_LABELS, ANIME_ESTADO_VALID_VALUES } from '../../../../shared/constants/anime-estado.constants';
import type { AnimeEditorDraft, AnimeEditorEmptyStateCopy, AnimeEditorStatusOption } from './anime-editor-workspace.types';

/** The Folder field's "(?)" help (S17): a folder change does not re-measure episode durations. */
export const ANIME_EDITOR_FOLDER_HELP = {
  label: 'About the folder and episode durations',
  message: 'Changing the folder does not recalculate episode durations. To measure them again, use "Re-analyze folder" in the Episodes card.',
} as const;

/** Default empty draft used before the first editor record loads. */
export const ANIME_EDITOR_DEFAULT_DRAFT: AnimeEditorDraft = {
  name: '',
  status: ANIME_ESTADO_VALID_VALUES[0],
  progress: '',
  totalEpisodes: '',
  kind: '',
  page: '',
  folder: '',
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

/**
 * Feedback shown, as the accessible name of the loading status region, while
 * the Editor Library's watching-first list request is unresolved.
 */
export const ANIME_EDITOR_LIST_LOADING_LABEL = 'Loading anime list...';

/**
 * Label for the lifecycle action that reactivates an inactive anime.
 * Deliberately `Restore`, not `Restore anime` — asymmetric with `Deactivate
 * anime` on purpose, matching `ANIME_DETAIL_RESTORE_LABEL`.
 */
export const ANIME_EDITOR_RESTORE_LABEL = 'Restore';

/**
 * Label for the lifecycle action that resets a finished anime's watch cycle.
 * Matches `ANIME_DETAIL_REPEAT_LABEL`.
 */
export const ANIME_EDITOR_REPEAT_LABEL = 'Repeat';

/** Name and tooltip of the icon-only lifecycle action that deactivates an active anime. */
export const ANIME_EDITOR_DEACTIVATE_LABEL = 'Deactivate anime';

/**
 * Shape shared by the real `AnimeEditorListRow` and its `AnimeEditorListSkeleton`
 * placeholder, so the two cannot drift apart silently.
 */
export const ANIME_EDITOR_LIST_ROW_CLASS = 'min-h-14 h-auto w-full min-w-0 justify-start rounded-xl border-l-2 px-3 py-1.5 transition-colors';

/** How many placeholder rows the Editor Library draws while its list request is unresolved. */
export const ANIME_EDITOR_SKELETON_ROW_COUNT = 6;

/**
 * The one entry that renders the shared cover placeholder. A row that has no
 * saved cover, and every degraded path (missing binding, failed lookup, failed
 * decode), resolves to this. Single frozen instance so the cache cannot hand
 * two rows differently-shaped "no cover" entries.
 */
export const ANIME_EDITOR_COVER_PLACEHOLDER: AnimeCoverEntry = { status: 'placeholder' };

/** The entry a target sits in between being requested and resolving. */
export const ANIME_EDITOR_COVER_LOADING: AnimeCoverEntry = { status: 'loading' };

/**
 * The rail thumbnail slot (44 px), shared by a real row's cover and the
 * placeholder skeleton that stands in for it so the two cannot drift. The
 * slot is fixed-size with the art filling it, so a cover's own aspect ratio
 * can never change a row's height.
 */
export const ANIME_EDITOR_LIST_COVER_CLASS = 'size-11 shrink-0 overflow-hidden rounded-lg';

/**
 * The selected-record header thumbnail slot (60 px), the header's own size of
 * the same fixed-slot shape the rail rows use.
 */
export const ANIME_EDITOR_HEADER_COVER_CLASS = 'size-[60px] shrink-0 overflow-hidden rounded-xl';

/**
 * Accessible name of the header thumbnail's loading status region, announcing
 * the pending cover the way `AnimeDetail`'s hero avatar does.
 */
export const ANIME_EDITOR_HEADER_COVER_LOADING_LABEL = 'Loading anime cover...';

/**
 * Copy for each Library empty state. The actual-empty wording states the
 * library is empty; the criteria-empty wording deliberately never does, because
 * a filtered-down rail that claims the library is empty sends the user off to
 * re-create anime they already have.
 */
export const ANIME_EDITOR_EMPTY_STATE_COPY: Readonly<Record<'actual' | 'criteria', AnimeEditorEmptyStateCopy>> = {
  actual: {
    title: 'Your library is empty',
    description: 'No anime are stored yet. Create one to start building your library.',
  },
  criteria: {
    title: 'No anime match your criteria',
    description: 'The current search and filters hide every anime in your library.',
  },
};
