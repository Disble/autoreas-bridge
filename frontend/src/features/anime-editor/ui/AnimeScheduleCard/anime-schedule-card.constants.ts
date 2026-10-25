import type { AnimeScheduleBoardLoad } from './anime-schedule-card.types';

/** Title of the Schedule card. */
export const ANIME_SCHEDULE_CARD_TITLE = 'Schedule';

/** Description under the Schedule card title. */
export const ANIME_SCHEDULE_CARD_DESCRIPTION = 'Days this anime airs. The editor arranges every active anime and applies on its own.';

/** Label of the button that opens the schedule editor. */
export const ANIME_SCHEDULE_CARD_OPEN_LABEL = 'Open schedule editor';

/** Accessible name of the week strip. */
export const ANIME_SCHEDULE_WEEK_LABEL = 'Week placement';

/** Accessible name of the season row. */
export const ANIME_SCHEDULE_SEASON_LABEL = 'Season placement';

/** Visible caption above the week strip. */
export const ANIME_SCHEDULE_WEEK_CAPTION = 'Week';

/** Visible caption above the season row. */
export const ANIME_SCHEDULE_SEASON_CAPTION = 'Season';

/** Accessible name of the week strip's loading status region. */
export const ANIME_SCHEDULE_WEEK_LOADING_LABEL = 'Loading the week schedule';

/** Alert title when the board could not be read. */
export const ANIME_SCHEDULE_WEEK_FAILED_TITLE = 'The schedule could not be loaded.';

/** Fallback message of a failed board read that carries none. */
export const ANIME_SCHEDULE_WEEK_FAILED_MESSAGE = 'The schedule board could not be loaded.';

/** One placeholder per weekday while the board loads. */
export const ANIME_SCHEDULE_WEEK_SKELETON_COUNT = 7;

/** One placeholder per season section (Sin ver, Ver hoy, Visto) while the board loads. */
export const ANIME_SCHEDULE_SEASON_SKELETON_COUNT = 3;

/** The seven-column grid both rows share, so a season section lines up under a weekday. */
export const ANIME_SCHEDULE_ROW_GRID_CLASS = 'grid grid-cols-7 gap-2';

/** The caption above each row. */
export const ANIME_SCHEDULE_ROW_CAPTION_CLASS = 'text-xs font-semibold text-muted';

/** Cell shape shared by the real day cells and their skeletons, so the strip never jumps. */
export const ANIME_SCHEDULE_WEEK_CELL_CLASS = 'flex min-h-[76px] min-w-0 flex-col gap-2 rounded-xl p-2.5';

/** The board read before any anime is selected. */
export const ANIME_SCHEDULE_BOARD_IDLE_LOAD: AnimeScheduleBoardLoad = { status: 'idle' };
