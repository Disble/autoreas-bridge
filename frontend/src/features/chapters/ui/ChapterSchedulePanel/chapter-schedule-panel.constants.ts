/** Legacy weekday keys supported by anime schedule records. */
export const CHAPTER_DAY_OPTIONS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;

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
  { label: 'Watching', value: 0 },
  { label: 'Completed', value: 1 },
  { label: 'Dropped', value: 2 },
  { label: 'Paused', value: 3 },
] as const;
