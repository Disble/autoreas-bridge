import type {
  AnimeEditorRecord,
  AnimeEditorScheduleBoard,
  AnimeEditorScheduleBoardEntry,
  AnimeEditorScheduleBoardResult,
  AnimeScheduleDestination,
  AnimeSchedulePlacement,
} from '../../../../shared/contracts/anime.types';
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
 * One cell: the selected anime's normalized place among that day's animes (N,
 * by board order, ties kept in board order) and how many air that day (M).
 * An anime the board leaves out (an inactive, history anime) is painted from
 * its saved placements instead, without a place, since nothing ranks it.
 */
function toDayCell(
  destination: AnimeScheduleDestination,
  entries: readonly AnimeEditorScheduleBoardEntry[],
  animeId: string | undefined,
  offBoardPlacements: readonly AnimeSchedulePlacement[],
): AnimeScheduleWeekDayView {
  const ranked = entries.flatMap((entry) => firstOrderOn(entry, destination.id)).toSorted((left, right) => left.order - right.order);
  const index = ranked.findIndex((day) => day.animeId === animeId);
  const base = { id: destination.id, label: destination.label };
  if (index >= 0) {
    const position = { order: index + 1, total: ranked.length };
    return { ...base, isScheduled: true, position, ariaLabel: `${destination.label}: ${position.order} of ${position.total}` };
  }
  if (offBoardPlacements.some((placement) => placement.day === destination.id)) {
    return { ...base, isScheduled: true, ariaLabel: `${destination.label}: scheduled` };
  }
  return { ...base, isScheduled: false, ariaLabel: `${destination.label}: not scheduled` };
}

/**
 * The cells of one destination kind (S16): `weekday` for the week strip,
 * `special` for the season row, labelled as the backend sends them. The
 * selected anime is passed explicitly because a board returned by an apply
 * carries no origin. The board is the authority for an anime on it; the saved
 * placements only paint an anime the board leaves out.
 */
export function toAnimeScheduleDays(
  board: AnimeEditorScheduleBoard,
  animeId: string | undefined,
  kind: AnimeScheduleDestination['kind'],
  savedPlacements: readonly AnimeSchedulePlacement[],
): readonly AnimeScheduleWeekDayView[] {
  const isOnBoard = board.entries.some((entry) => entry.animeId === animeId);
  const offBoardPlacements = isOnBoard ? [] : savedPlacements;
  return board.destinations.filter((destination) => destination.kind === kind).map((destination) => toDayCell(destination, board.entries, animeId, offBoardPlacements));
}

/** The saved placements of the selected anime, or none while the loaded record belongs to another one. */
export function toAnimeScheduleSavedPlacements(record: AnimeEditorRecord | undefined, animeId: string | undefined): readonly AnimeSchedulePlacement[] {
  return record !== undefined && record.animeId === animeId ? record.frequent.placements : [];
}

/** The week strip view: its exclusive state, the cells of a read board, and why a read failed. */
export function toAnimeScheduleWeekView(load: AnimeScheduleBoardLoad, animeId: string | undefined, savedPlacements: readonly AnimeSchedulePlacement[]): AnimeScheduleWeekView {
  if (load.status === 'ready') {
    return {
      status: 'ready',
      days: toAnimeScheduleDays(load.board, animeId, 'weekday', savedPlacements),
      seasonDays: toAnimeScheduleDays(load.board, animeId, 'special', savedPlacements),
    };
  }
  return load.status === 'failed' ? { status: 'failed', days: [], seasonDays: [], failureMessage: load.message } : { status: load.status, days: [], seasonDays: [] };
}

/** Reads one board answer: a board with a non-error outcome is ready; anything else failed. */
export function toAnimeScheduleBoardLoad(result: AnimeEditorScheduleBoardResult): AnimeScheduleBoardLoad {
  if (result.board !== undefined && result.outcome !== 'error') return { status: 'ready', board: result.board };
  const message = resolveAnimeEditorFeedbackMessage(result, ANIME_SCHEDULE_WEEK_FAILED_MESSAGE);
  return { status: 'failed', message, board: result.board };
}
