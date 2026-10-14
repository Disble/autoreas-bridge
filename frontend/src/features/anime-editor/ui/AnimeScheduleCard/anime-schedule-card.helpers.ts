import type { AnimeEditorScheduleBoard, AnimeEditorScheduleBoardEntry, AnimeEditorScheduleBoardResult, AnimeScheduleDestination } from '../../../../shared/contracts/anime.types';
import { resolveAnimeEditorFeedbackMessage } from '../AnimeEditorWorkspace/anime-editor-workspace.helpers';
import { ANIME_SCHEDULE_WEEK_FAILED_MESSAGE } from './anime-schedule-card.constants';
import type { AnimeScheduleBoardLoad, AnimeScheduleWeekDayView, AnimeScheduleWeekView } from './anime-schedule-card.types';

/** One anime on one day: its first (lowest) order there. */
interface AnimeDayOrder {
  readonly animeId: string;
  readonly order: number;
}

/** The anime's first order on `dayId`, or nothing when it does not air that day. */
function firstOrderOn(entry: AnimeEditorScheduleBoardEntry, dayId: string): readonly AnimeDayOrder[] {
  const orders = entry.placements.filter((placement) => placement.day === dayId).map((placement) => placement.order);
  return orders.length === 0 ? [] : [{ animeId: entry.animeId, order: Math.min(...orders) }];
}

/**
 * One week-strip cell: the selected anime's normalized place among that day's
 * animes (N, by board order, ties kept in board order) and how many air that
 * day (M), or "not scheduled".
 */
function toWeekDay(destination: AnimeScheduleDestination, entries: readonly AnimeEditorScheduleBoardEntry[], animeId: string | undefined): AnimeScheduleWeekDayView {
  const ranked = entries.flatMap((entry) => firstOrderOn(entry, destination.id)).toSorted((left, right) => left.order - right.order);
  const index = ranked.findIndex((day) => day.animeId === animeId);
  const base = { id: destination.id, label: destination.label };
  if (index < 0) return { ...base, ariaLabel: `${destination.label}: not scheduled` };
  const position = { order: index + 1, total: ranked.length };
  return { ...base, position, ariaLabel: `${destination.label}: ${position.order} of ${position.total}` };
}

/**
 * The week strip of the selected anime (S16): one cell per weekday destination
 * of the board, labelled as the backend sends it. The selected anime is passed
 * explicitly because a board returned by an apply carries no origin.
 */
export function toAnimeScheduleWeekDays(board: AnimeEditorScheduleBoard, animeId: string | undefined): readonly AnimeScheduleWeekDayView[] {
  return board.destinations.filter((destination) => destination.kind === 'weekday').map((destination) => toWeekDay(destination, board.entries, animeId));
}

/** The week strip view: its exclusive state, the cells of a read board, and why a read failed. */
export function toAnimeScheduleWeekView(load: AnimeScheduleBoardLoad, animeId: string | undefined): AnimeScheduleWeekView {
  if (load.status === 'ready') return { status: 'ready', days: toAnimeScheduleWeekDays(load.board, animeId) };
  return load.status === 'failed' ? { status: 'failed', days: [], failureMessage: load.message } : { status: load.status, days: [] };
}

/** Reads one board answer: a board with a non-error outcome is ready; anything else failed. */
export function toAnimeScheduleBoardLoad(result: AnimeEditorScheduleBoardResult): AnimeScheduleBoardLoad {
  if (result.board !== undefined && result.outcome !== 'error') return { status: 'ready', board: result.board };
  const message = resolveAnimeEditorFeedbackMessage(result, ANIME_SCHEDULE_WEEK_FAILED_MESSAGE);
  return { status: 'failed', message, board: result.board };
}
