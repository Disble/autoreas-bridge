import type { DailyBoardSectionCopy } from './daily-board.types';

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
    title: 'Sin ver — pick what you watch today',
    description: 'Sent animes download at the daily scheduled time — or manually if that window has already passed.',
    emptyTitle: 'Nothing left to schedule.',
    emptyDescription: 'Every created anime is already in Ver hoy or Visto.',
  },
  verHoy: {
    title: 'Ver hoy — watching (drains as you watch)',
    description: "Today's batch. Each anime leaves Ver hoy on its own as you watch its episodes.",
    emptyTitle: 'Nothing being watched.',
    emptyDescription: 'No anime was in Ver hoy when this season was last open.',
  },
  visto: {
    title: 'Visto — watched, ready for evaluation',
    description: 'Every watched anime with its first-episode grade state.',
    emptyTitle: 'Nothing watched yet.',
    emptyDescription: 'No anime reached Visto this season.',
  },
};
