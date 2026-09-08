/** Fallback shown for a studios/origin field the legacy record left empty. */
export const ANIME_DETAIL_UNKNOWN_LABEL = 'Unknown';

/** Shared long-date formatter hoisted once for Anime Detail helper formatting. */
export const ANIME_DETAIL_LONG_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

/** Message rendered while the detail fetch is in flight. */
export const ANIME_DETAIL_LOADING_MESSAGE = 'Loading anime detail...';

/**
 * Shared class for the hero avatar circle (the real cover image and its
 * empty-cover placeholder both size themselves against this), reused by
 * `AnimeDetailSkeleton` so the placeholder circle cannot drift out of sync
 * with the resolved avatar's footprint.
 */
export const ANIME_DETAIL_HERO_AVATAR_CLASS = 'size-24 shrink-0 rounded-full';

/**
 * Shared class for a single stat tile, used by both the resolved tile row
 * and `AnimeDetailSkeleton`'s placeholder tiles so the two shapes cannot
 * drift apart.
 */
export const ANIME_DETAIL_STAT_TILE_CLASS = 'rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2';

/** Number of placeholder stat tiles rendered while loading, matching the resolved tile row. */
export const ANIME_DETAIL_SKELETON_TILE_COUNT = 3;

/**
 * Number of placeholder field-group sections rendered while loading,
 * matching the resolved Episode info / General data / Repetition history
 * sections.
 */
export const ANIME_DETAIL_SKELETON_FIELD_GROUP_COUNT = 3;

/** Message rendered when the anime id does not resolve to a record. */
export const ANIME_DETAIL_NOT_FOUND_MESSAGE = 'Anime not found.';

/** Message rendered when an anime has no repetition-history entries. */
export const ANIME_DETAIL_NO_REPETITIONS_MESSAGE = 'No repetition history.';

/** Label for the hero status chip when the anime record is active (`activo` = 1). */
export const ANIME_DETAIL_STATUS_ACTIVE_LABEL = 'Active';

/** Label for the hero status chip when the anime record is inactive/soft-deleted (`activo` = 0). */
export const ANIME_DETAIL_STATUS_INACTIVE_LABEL = 'Inactive';

/** Fallback shown in the per-episode section when `totalcap` is absent. */
export const ANIME_DETAIL_NO_TOTAL_EPISODES_MESSAGE = 'No total episodes data';

/** Fallback shown in the per-episode section when `duracion` is absent. */
export const ANIME_DETAIL_NO_DURATION_MESSAGE = 'No episode duration data';

/** Fallback shown in the general-data section when `pagina` is absent. */
export const ANIME_DETAIL_NO_PAGINA_MESSAGE = 'No page link available';

/** Fallback shown in the general-data section when `generos` is empty. */
export const ANIME_DETAIL_NO_GENEROS_MESSAGE = 'No genres listed';

/** Stat-tile caption for the episodes-watched counter. */
export const ANIME_DETAIL_WATCHED_TILE_LABEL = 'Watched';

/** Stat-tile caption for the total-episodes counter. */
export const ANIME_DETAIL_TOTAL_TILE_LABEL = 'Total episodes';

/** Stat-tile caption for the per-episode duration. */
export const ANIME_DETAIL_DURATION_TILE_LABEL = 'Duration';

/** Alt text for the hero cover image. */
export const ANIME_DETAIL_PORTADA_ALT = 'Cover art';

/** Accessible label for the per-episode watched/total progress bar. */
export const ANIME_DETAIL_PROGRESS_LABEL = 'Episodes watched progress';

/** Label for the back-navigation button (Anime Detail delta spec, "Back returns to the exact History spot"). */
export const ANIME_DETAIL_BACK_LABEL = 'Back';

/** Label for the action that starts a new watch cycle. */
export const ANIME_DETAIL_REPEAT_LABEL = 'Repeat';

/** Label for the action that makes an inactive anime active again. */
export const ANIME_DETAIL_RESTORE_LABEL = 'Restore';

/** Label for dismissing a pending anime mutation. */
export const ANIME_DETAIL_CANCEL_LABEL = 'Cancel';

/**
 * Fallback shown for an absent repetition-entry date. Deliberately distinct
 * from `ANIME_DETAIL_UNKNOWN_LABEL` ("Unknown", used by the general-data
 * section): the delta spec calls for an explicit "No data" label on every
 * repetition timeline date field.
 */
export const ANIME_DETAIL_NO_DATA_LABEL = 'No data';

/** Definition-grid caption for a repetition entry's episodes-watched count. */
export const ANIME_DETAIL_REPETITION_EPISODES_LABEL = 'Episodes watched';

/** Definition-grid caption for a repetition entry's fecha de creación. */
export const ANIME_DETAIL_REPETITION_CREATED_LABEL = 'Created';

/** Definition-grid caption for a repetition entry's fecha de estreno. */
export const ANIME_DETAIL_REPETITION_PREMIERE_LABEL = 'Premiere';

/** Definition-grid caption for a repetition entry's fecha de último capítulo visto. */
export const ANIME_DETAIL_REPETITION_LAST_WATCHED_LABEL = 'Last watched';

/** Definition-grid caption for a repetition entry's fecha de eliminación. */
export const ANIME_DETAIL_REPETITION_DELETED_LABEL = 'Deleted';

/** Definition-grid caption for a repetition entry's siguiente repetición (`fechaRepeticion`). */
export const ANIME_DETAIL_REPETITION_NEXT_LABEL = 'Next repetition';
