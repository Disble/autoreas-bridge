import type {
  SeasonAnimeRow,
  SeasonDailyBoardEntry,
  SeasonSource,
} from '../../../../infrastructure/season-source/season-source.types';
import {
  DAILY_BOARD_HISTORY_LOAD_ERROR,
  EMPTY_BOARD_SECTIONS,
  LIVE_DAILY_BOARD_HISTORY,
  LOADING_DAILY_BOARD_HISTORY,
} from './daily-board.constants';
import { groupCreatedBySection, listBoardAnimeIds } from './daily-board.helpers';
import type { BoardSections, DailyBoardHistory, DailyBoardView, LoadedDailyBoardHistory } from './daily-board.types';

/**
 * Reads the Daily board a closed season stored at close. A source that cannot
 * read the closure snapshot, or a read that throws, is a failure rather than a
 * claim that nothing was recorded; a snapshot without a recorded Daily board is
 * `unrecorded`.
 *
 * @param source The season port.
 * @param seasonId The closed season being viewed.
 * @returns The settled read, tagged with its season.
 */
export async function readDailyBoardHistory(source: SeasonSource, seasonId: string): Promise<LoadedDailyBoardHistory> {
  if (source.getSeasonOrderingSnapshot === undefined) {
    return { seasonId, history: { status: 'failed', errorMessage: DAILY_BOARD_HISTORY_LOAD_ERROR } };
  }
  try {
    const dailyBoard = (await source.getSeasonOrderingSnapshot(seasonId)).dailyBoard;
    return {
      seasonId,
      history: dailyBoard?.recorded === true ? { status: 'recorded', entries: dailyBoard.entries } : { status: 'unrecorded' },
    };
  } catch (error) {
    return {
      seasonId,
      history: { status: 'failed', errorMessage: error instanceof Error ? error.message : DAILY_BOARD_HISTORY_LOAD_ERROR },
    };
  }
}

/**
 * The history the board renders: live for an open season; for a closed one the
 * settled read for THAT season, or `loading` while none has settled (so a slow
 * read never shows another season's board).
 *
 * @param viewSeasonId The closed season being viewed, or null for the open one.
 * @param loaded The last settled read, or null.
 * @returns The current history.
 */
export function resolveDailyBoardHistory(viewSeasonId: string | null, loaded: LoadedDailyBoardHistory | null): DailyBoardHistory {
  if (viewSeasonId === null) {
    return LIVE_DAILY_BOARD_HISTORY;
  }
  return loaded?.seasonId === viewSeasonId ? loaded.history : LOADING_DAILY_BOARD_HISTORY;
}

/**
 * Rebuilds the conveyor sections from the stored Daily board: each section
 * holds its entries' season rows in stored order. An entry whose row is not in
 * the season's rows is skipped.
 *
 * @param rows The season's rows.
 * @param entries The Daily board stored at close.
 * @returns The sections as the season closed with them.
 */
export function groupSnapshotSections(rows: readonly SeasonAnimeRow[], entries: readonly SeasonDailyBoardEntry[]): BoardSections {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const sectionRows = (section: string): SeasonAnimeRow[] =>
    entries
      .filter((entry) => entry.section === section)
      .toSorted((left, right) => left.order - right.order)
      .flatMap((entry) => rowsById.get(entry.rowId) ?? []);
  return { sinVer: sectionRows('Sin ver'), verHoy: sectionRows('Ver hoy'), visto: sectionRows('Visto') };
}

/**
 * Derives the board's render model from the season rows and the history read.
 *
 * @param rows The season's rows.
 * @param history Where the Daily board read stands.
 * @returns What the board renders.
 */
export function selectDailyBoardView(rows: readonly SeasonAnimeRow[], history: DailyBoardHistory): DailyBoardView {
  switch (history.status) {
    case 'live':
      return { mode: 'sections', sections: groupCreatedBySection(rows), plainRows: [] };
    case 'recorded':
      return { mode: 'sections', sections: groupSnapshotSections(rows, history.entries), plainRows: [] };
    case 'unrecorded':
      return { mode: 'plain', sections: EMPTY_BOARD_SECTIONS, plainRows: rows.filter((row) => row.availability === 'created') };
    case 'failed':
      return { mode: 'failed', sections: EMPTY_BOARD_SECTIONS, plainRows: [], historyError: history.errorMessage };
    default:
      return { mode: 'loading', sections: EMPTY_BOARD_SECTIONS, plainRows: [] };
  }
}

/**
 * Lists the anime id of every row the view renders, sections first then the
 * plain list, so the board can ask for each row's cover.
 *
 * @param view The board's render model.
 * @returns The rendered rows' anime ids in render order.
 */
export function listViewAnimeIds(view: DailyBoardView): string[] {
  return [...listBoardAnimeIds(view.sections), ...view.plainRows.map((row) => row.animeId)];
}
