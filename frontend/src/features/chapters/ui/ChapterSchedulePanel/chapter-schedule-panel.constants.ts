import checkCircleIcon from '@iconify-icons/solar/check-circle-bold-duotone';
import closeCircleIcon from '@iconify-icons/solar/close-circle-bold-duotone';
import pauseCircleIcon from '@iconify-icons/solar/pause-circle-bold-duotone';
import playCircleIcon from '@iconify-icons/solar/play-circle-bold-duotone';

/** Legacy weekday keys supported by anime schedule records. */
export const CHAPTER_DAY_OPTIONS = ['Lunes', 'Martes', 'Mi\u00e9rcoles', 'Jueves', 'Viernes', 'S\u00e1bado', 'Domingo'] as const;

/** Legacy season keys used when season mode groups anime by watch state. */
export const CHAPTER_SEASON_OPTIONS = ['Sin ver', 'Visto', 'Ver hoy'] as const;

/** Empty-state copy for days with no active scheduled anime. */
export const CHAPTERS_EMPTY_MESSAGE = 'No active anime are scheduled for this filter.';

/** User-facing labels for Legacy anime state ids. */
export const CHAPTER_STATE_LABELS: Readonly<Record<number, string>> = {
  0: 'Watching',
  1: 'Completed',
  2: 'Dropped',
  3: 'Paused',
};

/** Runtime fallback result used when Wails bindings are not ready. */
export const CHAPTER_RUNTIME_UNAVAILABLE_RESULT = { status: 'error', message: 'runtime unavailable' } as const;

/** State transition options exposed by the Chapters operational panel. */
export const CHAPTER_STATE_OPTIONS = [
  { icon: playCircleIcon, label: 'Watching', value: 0 },
  { icon: checkCircleIcon, label: 'Completed', value: 1 },
  { icon: closeCircleIcon, label: 'Dropped', value: 2 },
  { icon: pauseCircleIcon, label: 'Paused', value: 3 },
] as const;

/**
 * Fixed-size wrapper class shared by the cover slot's placeholder and image states.
 * The negative margins bleed the slot through the Card's `p-4` padding so the art
 * reaches the card edge (the Card's own `overflow-hidden` clips the corners), and
 * `relative` lets the art position absolutely so the source aspect ratio can never
 * change the card height.
 */
export const CHAPTER_COVER_SLOT_CLASS = 'relative -my-4 -ml-4 w-24 shrink-0 self-stretch overflow-hidden';
