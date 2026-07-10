import checkCircleIcon from '@iconify-icons/solar/check-circle-bold-duotone';
import closeCircleIcon from '@iconify-icons/solar/close-circle-bold-duotone';
import pauseCircleIcon from '@iconify-icons/solar/pause-circle-bold-duotone';
import playCircleIcon from '@iconify-icons/solar/play-circle-bold-duotone';
import { ANIME_ESTADO_LABELS } from '../../../../shared/constants/anime-estado';
import type { ChapterViewLens } from './chapter-schedule-panel.types';

/** Legacy weekday keys supported by anime schedule records. */
export const CHAPTER_DAY_OPTIONS = ['Lunes', 'Martes', 'Mi\u00e9rcoles', 'Jueves', 'Viernes', 'S\u00e1bado', 'Domingo'] as const;

/** Legacy season keys used when season mode groups anime by watch state. */
export const CHAPTER_SEASON_OPTIONS = ['Sin ver', 'Visto', 'Ver hoy'] as const;

/** Accessible name for the in-view lens toggle (season watch-states vs weekdays). */
export const CHAPTER_LENS_TOGGLE_LABEL = 'Chapters view lens';

/** Selectable lenses for the Chapters view toggle, in display order. */
export const CHAPTER_LENS_OPTIONS: readonly { readonly id: ChapterViewLens; readonly label: string }[] = [
  { id: 'season', label: 'Season' },
  { id: 'daily', label: 'Daily' },
];

/** Empty-state copy for days with no active scheduled anime. */
export const CHAPTERS_EMPTY_MESSAGE = 'No active anime are scheduled for this filter.';

/**
 * User-facing labels for Legacy anime state ids. Sourced from the canonical
 * shared vocabulary (`shared/constants/anime-estado.ts`) so Chapters shows the
 * same Spanish estado wording as History/Catalog/AnimeDetail.
 */
export const CHAPTER_STATE_LABELS: Readonly<Record<number, string>> = ANIME_ESTADO_LABELS;

/** Runtime fallback result used when Wails bindings are not ready. */
export const CHAPTER_RUNTIME_UNAVAILABLE_RESULT = { status: 'error', message: 'runtime unavailable' } as const;

/** State transition options exposed by the Chapters operational panel. */
export const CHAPTER_STATE_OPTIONS = [
  { icon: playCircleIcon, label: ANIME_ESTADO_LABELS[0], value: 0 },
  { icon: checkCircleIcon, label: ANIME_ESTADO_LABELS[1], value: 1 },
  { icon: closeCircleIcon, label: ANIME_ESTADO_LABELS[2], value: 2 },
  { icon: pauseCircleIcon, label: ANIME_ESTADO_LABELS[3], value: 3 },
] as const;

/**
 * Fixed-size wrapper class shared by the cover slot's placeholder and image states.
 * The negative margins bleed the slot through the Card's `p-4` padding so the art
 * reaches the card edge (the Card's own `overflow-hidden` clips the corners), and
 * `relative` lets the art position absolutely so the source aspect ratio can never
 * change the card height.
 */
export const CHAPTER_COVER_SLOT_CLASS = 'relative -my-4 -ml-4 w-24 shrink-0 self-stretch overflow-hidden';
