import type { BoardSections, DailyBoardHistory, DailyBoardSectionCopy } from './daily-board.types';

/** Weekday dias values (Spanish data literals) — a section outside Estrenos. */
export const WEEKDAY_SECTIONS: ReadonlySet<string> = new Set([
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
]);

/** Ver hoy stays one column: it holds today's few animes. */
export const VER_HOY_LIST_CLASS = 'flex flex-col gap-1';

/**
 * Visto lists the whole season's watched animes at a glance, so it flows into
 * two or three columns when the width allows; names truncate with a tooltip.
 */
export const VISTO_LIST_CLASS = 'grid gap-x-4 gap-y-1 sm:grid-cols-2 xl:grid-cols-3';

/**
 * Each section card's copy. The empty copy shows only in a read-only season (an
 * open season hides an empty section).
 */
export const DAILY_BOARD_SECTION_COPY: Readonly<Record<'sinVer' | 'verHoy' | 'visto', DailyBoardSectionCopy>> = {
  sinVer: {
    title: 'Sin ver',
    emptyTitle: 'Nothing left to schedule.',
    emptyDescription: 'Every created anime is already in Ver hoy or Visto.',
  },
  verHoy: {
    title: 'Ver hoy',
    emptyTitle: 'Nothing being watched.',
    emptyDescription: 'No anime was in Ver hoy when this season was last open.',
  },
  visto: {
    title: 'Visto',
    emptyTitle: 'Nothing watched yet.',
    emptyDescription: 'No anime reached Visto this season.',
  },
};

/**
 * The plain list a closed season shows when it closed before its Daily board was
 * recorded: no section can be claimed, so it lists the season's animes only.
 */
export const DAILY_BOARD_PLAIN_COPY = {
  title: 'Season animes',
  description: 'The daily board state was not recorded when this season closed.',
  emptyTitle: 'No animes created.',
  emptyDescription: 'This season created no anime.',
} as const;

/** The accessible name of the list of a closed season's animes. */
export const DAILY_BOARD_PLAIN_LIST_LABEL = 'Season animes';

/** The status announced while a closed season's Daily board is read. */
export const DAILY_BOARD_LOADING_LABEL = 'Loading the daily board';

/** One placeholder bar per conveyor section card the read resolves into. */
export const DAILY_BOARD_SKELETON_ROW_COUNT = 3;

/** A placeholder bar's shape: one section card. */
export const DAILY_BOARD_SKELETON_BAR_CLASS = 'h-24 w-full rounded-lg';

/** The message shown when the source cannot read a closed season's snapshot. */
export const DAILY_BOARD_HISTORY_LOAD_ERROR = 'Could not load the daily board stored for this season.';

/** The open-season history: the board follows live sections. */
export const LIVE_DAILY_BOARD_HISTORY: DailyBoardHistory = { status: 'live' };

/** A closed season whose snapshot read has not settled; one stable value so memos hold. */
export const LOADING_DAILY_BOARD_HISTORY: DailyBoardHistory = { status: 'loading' };

/** No row in any section. */
export const EMPTY_BOARD_SECTIONS: BoardSections = { sinVer: [], verHoy: [], visto: [] };
