import type { AnimeEditorScheduleBoard } from '../../../../shared/contracts/anime.types';

/**
 * Where the editor schedule board read stands. A failed read may still carry a
 * board (the runtime-unavailable fallback does), which the modal can open on.
 */
export type AnimeScheduleBoardLoad =
  | { readonly status: 'idle'; readonly board?: undefined; readonly message?: undefined }
  | { readonly status: 'loading'; readonly board?: undefined; readonly message?: undefined }
  | { readonly status: 'ready'; readonly board: AnimeEditorScheduleBoard; readonly message?: undefined }
  | { readonly status: 'failed'; readonly board?: AnimeEditorScheduleBoard; readonly message: string };

/** The selected anime's place on one weekday: the N-th of M animes that day. */
export interface AnimeScheduleWeekPosition {
  /** The anime's 1-based place among that day's animes, by board order. */
  readonly order: number;
  /** How many board animes air that day. */
  readonly total: number;
}

/** One cell of the week strip or the season row. */
export interface AnimeScheduleWeekDayView {
  readonly id: string;
  /** The day or season section name exactly as the backend sends it (Lunes…Domingo, Sin ver…Visto). */
  readonly label: string;
  /** Whether the selected anime is placed there, ranked or not. */
  readonly isScheduled: boolean;
  /** The selected anime's place that day; absent when it does not air that day or is not on the board. */
  readonly position?: AnimeScheduleWeekPosition;
  /** "Lunes: 3 of 3", "Ver hoy: scheduled" or "Jueves: not scheduled". */
  readonly ariaLabel: string;
}

/** The week strip and season row, ready to render: which exclusive state, the cells, and why it failed. */
export interface AnimeScheduleWeekView {
  readonly status: AnimeScheduleBoardLoad['status'];
  readonly days: readonly AnimeScheduleWeekDayView[];
  /** The season sections (Sin ver, Ver hoy, Visto), shown whatever the season mode. */
  readonly seasonDays: readonly AnimeScheduleWeekDayView[];
  readonly failureMessage?: string;
}

/** Props for one captioned row of the Schedule card: the week strip or the season row. */
export interface AnimeScheduleDayRowProps {
  /** The visible caption above the row ("Week", "Season"). */
  readonly caption: string;
  /** The accessible name of the row's list. */
  readonly listLabel: string;
  readonly days: readonly AnimeScheduleWeekDayView[];
}

/** Props for the Editor's Schedule card. */
export interface AnimeScheduleCardProps {
  readonly week: AnimeScheduleWeekView;
  /** Opens the schedule editor, behind the unsaved-changes guard. */
  readonly onOpenSchedule: () => void;
}
