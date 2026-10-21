import type { AnimeDetailDesktopActionFeedback } from './anime-detail.types';

/** Fallback shown for any general-data field the record left empty. */
export const ANIME_DETAIL_UNKNOWN_LABEL = 'Unknown';

/** Shared long-date formatter hoisted once for Anime Detail helper formatting. */
export const ANIME_DETAIL_LONG_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

/** Message rendered while the detail fetch is in flight. */
export const ANIME_DETAIL_LOADING_MESSAGE = 'Loading anime detail...';

/** Id of the page `h1`, so the main card can name itself after the anime. */
export const ANIME_DETAIL_TITLE_ID = 'anime-detail-title';

/** Id of the General data caption, which names its section. */
export const ANIME_DETAIL_GENERAL_DATA_TITLE_ID = 'anime-detail-general-data-title';

/**
 * Main card grid, laid out from the card's OWN width (`@container` on its
 * content): a 68px cover thumbnail beside the identity below 700px (76px below
 * 420px), and a 280px cover column beside the whole body from 700px up.
 * Shared with `AnimeDetailSkeleton` so the two shapes cannot drift apart.
 */
export const ANIME_DETAIL_GRID_CLASS = 'grid grid-cols-[68px_minmax(0,1fr)] items-center gap-x-4 gap-y-3 @max-[419px]:grid-cols-[76px_minmax(0,1fr)] @[700px]:grid-cols-[280px_minmax(0,1fr)] @[700px]:items-start';

/**
 * Body column: `contents` below 700px, so the identity sits beside the
 * thumbnail and General data spans the card; a flex column from 700px up.
 */
export const ANIME_DETAIL_BODY_CLASS = 'contents min-w-0 flex-col gap-3 @[700px]:flex';

/**
 * Cover frame: a 5:7 poster frame whose art fills it edge to edge. From 700px
 * up it keeps that ratio as its minimum and stretches to the body's height.
 * Shared with `AnimeDetailSkeleton`.
 */
export const ANIME_DETAIL_COVER_FRAME_CLASS = 'relative aspect-[5/7] w-full overflow-hidden rounded-xl ring-1 ring-border @[700px]:self-stretch';

/** General data inner surface; spans the card below 700px and sits in the body column above. */
export const ANIME_DETAIL_GENERAL_DATA_CLASS = 'col-span-full min-w-0 rounded-xl bg-white/[0.03] p-4 @[700px]:col-auto';

/** General data field grid: 2 columns, 3 from 700px, 1 below 420px. */
export const ANIME_DETAIL_FIELD_GRID_CLASS = 'm-0 grid grid-cols-2 gap-x-4 gap-y-3 @max-[419px]:grid-cols-1 @[700px]:grid-cols-3';

/** Number of General data fields, mirrored by the skeleton's field placeholders. */
export const ANIME_DETAIL_FIELD_COUNT = 8;

/** Message rendered when the anime id does not resolve to a record. */
export const ANIME_DETAIL_NOT_FOUND_MESSAGE = 'Anime not found.';

/** Label for the status chip when the anime record is active (`activo` = 1). */
export const ANIME_DETAIL_STATUS_ACTIVE_LABEL = 'Active';

/** Label for the status chip when the anime record is inactive/soft-deleted (`activo` = 0). */
export const ANIME_DETAIL_STATUS_INACTIVE_LABEL = 'Inactive';

/** Fallback appended to the episode count when `totalcap` is absent. */
export const ANIME_DETAIL_NO_TOTAL_EPISODES_MESSAGE = 'No total episodes data';

/** Fallback shown on the progress line when `duracion` is absent. */
export const ANIME_DETAIL_NO_DURATION_MESSAGE = 'No episode duration data';

/** Fallback shown in the General data section when `generos` is empty. */
export const ANIME_DETAIL_NO_GENEROS_MESSAGE = 'No genres listed';

/** Accessible name of the progress bar under the episode count. */
export const ANIME_DETAIL_PROGRESS_LABEL = 'Episodes watched';

/** Message announced by the cover's loading region while the cover binding is in flight. */
export const ANIME_DETAIL_PORTADA_LOADING_MESSAGE = 'Loading cover art...';

/** Accessible name of the toolbar's Back button. */
export const ANIME_DETAIL_BACK_LABEL = 'Back';

/** Tooltip of the toolbar's Back button. */
export const ANIME_DETAIL_BACK_TOOLTIP = 'Back';

/** Tooltip of the action that starts a new watch cycle. */
export const ANIME_DETAIL_REPEAT_LABEL = 'Repeat';

/** Tooltip of the action that makes an inactive anime active again. */
export const ANIME_DETAIL_RESTORE_LABEL = 'Restore';

/** Tooltip of the action that opens the anime in the editor. */
export const ANIME_DETAIL_EDIT_TOOLTIP = 'Edit anime';

/** Accessible name of the Folder field's copy button. */
export const ANIME_DETAIL_COPY_FOLDER_LABEL = 'Copy folder path';

/** Tooltip of the Folder field's copy button. */
export const ANIME_DETAIL_COPY_FOLDER_TOOLTIP = 'Copy path';

/** Toasts of the Folder copy action: a confirmation, since a copy shows nothing else. */
export const ANIME_DETAIL_COPY_FOLDER_FEEDBACK: AnimeDetailDesktopActionFeedback = {
  success: 'Folder path copied',
  failure: 'Could not copy the folder path',
};

/** Toasts of the Page link: failure only, because the opened browser is its own confirmation. */
export const ANIME_DETAIL_OPEN_PAGE_FEEDBACK: AnimeDetailDesktopActionFeedback = {
  failure: 'Could not open the page',
};

/** Label for dismissing a pending anime mutation. */
export const ANIME_DETAIL_CANCEL_LABEL = 'Cancel';

/**
 * Fallback shown for an absent pre-log summary date. Deliberately distinct
 * from `ANIME_DETAIL_UNKNOWN_LABEL` ("Unknown", used by the general-data
 * section): the delta spec calls for an explicit "No data" label on every
 * pre-log watch summary date field.
 */
export const ANIME_DETAIL_NO_DATA_LABEL = 'No data';

/** Accessible name of the no-cover poster and the pill it shows at full size. */
export const ANIME_DETAIL_NO_COVER_LABEL = 'No cover';
