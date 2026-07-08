/** The seven weekday columns, Lunes→Domingo (Spanish data literals — they ARE the `dias` values). */
export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;

/** Empty-state message when no approved candidate awaits placement. */
export const ORDERING_EMPTY_MESSAGE = 'No approved animes to place yet — confirm the selection first.';

/** Debounce (ms) before autosaving the working ordering draft. */
export const ORDERING_AUTOSAVE_DEBOUNCE_MS = 600;

/** dnd-kit container id for the rail (a real string — '' cannot be a droppable id). */
export const RAIL_CONTAINER_ID = '__rail__';

/** Every board container in render order: the rail first, then the seven weekdays. */
export const CONTAINERS = [RAIL_CONTAINER_ID, ...WEEKDAYS] as const;

/** Empty board used before the runtime board loads. */
export const EMPTY_ORDERING_BOARD = { rail: [], grid: [] } as const;
