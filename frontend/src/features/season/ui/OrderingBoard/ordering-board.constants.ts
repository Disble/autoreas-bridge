/** The seven weekday columns, Lunes→Domingo (Spanish data literals — they ARE the `dias` values). */
export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;

/** Empty-state message when no approved candidate awaits placement. */
export const ORDERING_EMPTY_MESSAGE = 'No approved animes to place yet — confirm the selection first.';

/** Heading and drop-zone name of the rail of approved animes awaiting a weekday. */
export const ORDERING_RAIL_LABEL = 'Approved to place';

/** Tooltip of a card's Remove button while the anime holds more than one card. */
export const ORDERING_REMOVE_TOOLTIP = 'Remove';

/** Tooltip of a card's locked Remove button: the anime's last card can never be removed. */
export const ORDERING_LAST_CARD_TOOLTIP = 'An anime must stay on at least one day';

/** Debounce (ms) before autosaving the working ordering draft. */
export const ORDERING_AUTOSAVE_DEBOUNCE_MS = 600;

/** Frontend invariant message when one weekday column contains the same anime twice. */
export const ORDERING_DUPLICATE_WEEKDAY_ERROR = 'Duplicate weekday placements are not allowed.';

/** dnd-kit container id for the rail (a real string — '' cannot be a droppable id). */
export const RAIL_CONTAINER_ID = '__rail__';

/** Empty board used before the runtime board loads. */
export const EMPTY_ORDERING_BOARD = { rail: [], grid: [] } as const;

/** Accessible name of the status region shown while a past season's stored board is read. */
export const ORDERING_BOARD_LOADING_LABEL = 'Loading the recorded ordering board';

/**
 * Read-only notice while viewing a past season. It must never claim the board
 * reflects the live schedule: the board shown is the closure snapshot, and it
 * may even be absent, so the wording stays true in every past-season case.
 */
export const ORDERING_PAST_SEASON_NOTICE =
  'Past season — read-only. This view never reflects the current live schedule; it shows only the board stored when the season closed.';

/** Empty-state title when a past season stored no ordering board. */
export const ORDERING_NOT_RECORDED_TITLE = 'Ordering board not recorded';

/** Empty-state description when a past season stored no ordering board. */
export const ORDERING_NOT_RECORDED_DESCRIPTION =
  'This season was closed before its ordering board was recorded, so there is no stored schedule to show.';

/** Failure message when a past season's stored board could not be read. */
export const ORDERING_HISTORY_LOAD_ERROR = 'Failed to load the recorded board';
