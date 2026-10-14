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

/** One cell of the week strip. */
export interface AnimeScheduleWeekDayView {
  readonly id: string;
  /** The day name exactly as the backend sends it (Lunes…Domingo). */
  readonly label: string;
  /** The selected anime's place that day; absent when it does not air that day. */
  readonly position?: AnimeScheduleWeekPosition;
  /** "Lunes: 3 of 3" or "Jueves: not scheduled". */
  readonly ariaLabel: string;
}

/** The week strip, ready to render: which exclusive state, the cells, and why it failed. */
export interface AnimeScheduleWeekView {
  readonly status: AnimeScheduleBoardLoad['status'];
  readonly days: readonly AnimeScheduleWeekDayView[];
  readonly failureMessage?: string;
}

/** Props for the Editor's Schedule card. */
export interface AnimeScheduleCardProps {
  readonly week: AnimeScheduleWeekView;
  /** Opens the schedule editor, behind the unsaved-changes guard. */
  readonly onOpenSchedule: () => void;
}
