import checkCircleIcon from '@iconify-icons/solar/check-circle-bold-duotone';
import closeCircleIcon from '@iconify-icons/solar/close-circle-bold-duotone';
import pauseCircleIcon from '@iconify-icons/solar/pause-circle-bold-duotone';
import playCircleIcon from '@iconify-icons/solar/play-circle-bold-duotone';
import { ANIME_ESTADO_LABELS } from '../../../../shared/constants/anime-estado.constants';
import type { EpisodeViewLens, CoverEntry } from './episode-schedule-panel.types';

/** Legacy weekday keys supported by anime schedule records. */
export const EPISODE_DAY_OPTIONS = ['Lunes', 'Martes', 'Mi\u00e9rcoles', 'Jueves', 'Viernes', 'S\u00e1bado', 'Domingo'] as const;

/**
 * English display labels for the Spanish weekday keys above. The Spanish key
 * remains the tab `id` and schedule filter value; only the rendered label is
 * English (spec: "Today Weekday Tabs in English").
 */
export const EPISODE_DAY_LABELS_EN: Readonly<Record<string, string>> = {
  Lunes: 'Monday',
  Martes: 'Tuesday',
  'Mi\u00e9rcoles': 'Wednesday',
  Jueves: 'Thursday',
  Viernes: 'Friday',
  'S\u00e1bado': 'Saturday',
  Domingo: 'Sunday',
};

/** Legacy season keys used when season mode groups anime by watch state. */
export const EPISODE_SEASON_OPTIONS = ['Sin ver', 'Visto', 'Ver hoy'] as const;

/** Accessible name for the in-view grouping toggle. */
export const EPISODE_LENS_TOGGLE_LABEL = 'Episodes view lens';

/** Selectable grouping lenses in display order. */
export const EPISODE_LENS_OPTIONS: readonly { readonly id: EpisodeViewLens; readonly label: string }[] = [
  { id: 'season', label: 'Season' },
  { id: 'daily', label: 'Daily' },
];

/**
 * Feedback shown, as the accessible name of the loading status region, while
 * the schedule request for the selected filter is unresolved.
 */
export const EPISODES_LOADING_MESSAGE = 'Loading the schedule...';

/** How many placeholder rows Today draws while its schedule request is unresolved. */
export const EPISODES_SKELETON_ROW_COUNT = 3;

/**
 * User-facing labels for Legacy anime state ids. Sourced from the canonical
 * shared vocabulary (`shared/constants/anime-estado.constants.ts`) so Episodes shows the
 * same Spanish estado wording as History/Catalog/AnimeDetail.
 */
export const EPISODE_STATE_LABELS: Readonly<Record<number, string>> = ANIME_ESTADO_LABELS;

/** Runtime fallback result used when Wails bindings are not ready. */
export const EPISODE_RUNTIME_UNAVAILABLE_RESULT = { status: 'error', message: 'runtime unavailable' } as const;

/** State transition options exposed by the Episodes operational panel. */
export const EPISODE_STATE_OPTIONS = [
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
export const EPISODE_COVER_SLOT_CLASS = 'relative -my-4 -ml-4 w-24 shrink-0 self-stretch overflow-hidden';

/** Hoisted Spanish weekday formatter used by the episode schedule default-day helper. */
export const EPISODE_SCHEDULE_WEEKDAY_FORMATTER = new Intl.DateTimeFormat('es-ES', { weekday: 'long' });

/** Shared empty cover cache used when no cover map is provided to the row helper. */
export const EPISODE_SCHEDULE_EMPTY_COVERS: ReadonlyMap<string, CoverEntry> = new Map();

/**
 * Dot marking the weekday tab that matches the current day. `bg-current` inherits
 * the tab's own text colour, so the marker stays visible on the selected tab (light
 * text over the accent fill) and on the unselected ones alike.
 */
export const EPISODE_TODAY_DOT_CLASS = 'size-1.5 shrink-0 rounded-full bg-current';

/**
 * Screen-reader wording appended to the current-day tab, since the dot is decorative.
 * It carries its own leading comma because the accessible name concatenates sibling
 * text with no separator: without it the tab announces "Sundaytoday".
 */
export const EPISODE_TODAY_MARKER_LABEL = ', today';

/**
 * The season lens's empty copy per section. The title says what is missing
 * without repeating the selected tab; the description says how the section is
 * filled, in the Daily board's own words. Only Ver hoy has a reliable story:
 * Sin ver and Visto here read the raw `Dias` value, which the Daily board does
 * not (it counts graduated weekday anime as Visto), so they use the neutral
 * fallback in `getEpisodeEmptyStateCopy` instead of claiming how they fill.
 */
export const EPISODE_SEASON_EMPTY_COPY: Readonly<Record<string, { readonly title: string; readonly description: string }>> = {
  'Ver hoy': {
    title: 'Nothing being watched today',
    description: "Ver hoy is today's batch. Pick it from Sin ver in Season, Intake & Daily. Each anime leaves Ver hoy on its own as you watch its episodes.",
  },
};

/** The season lens's empty-state action label. */
export const EPISODE_GO_TO_SEASON_LABEL = 'Go to Season';

/** The Season workspace route the season lens's empty state sends the user to. */
export const EPISODE_SEASON_ROUTE = '/season';
