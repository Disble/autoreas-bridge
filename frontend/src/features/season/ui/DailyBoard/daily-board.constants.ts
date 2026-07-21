/** Empty-state message when no created animes have reached the board yet. */
export const DAILY_BOARD_EMPTY_MESSAGE = 'No created animes yet — they appear here once episode 1 is available.';

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
