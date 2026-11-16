import type {
  SeasonAnimeRow,
  SeasonDailyBoardEntry,
  SeasonOrderingSnapshot,
} from '../../../../shared/contracts/season.types';
import type { AsyncView } from '../../../../shared/query/async-view/async-view.types';
import {
  DAILY_BOARD_HISTORY_LOAD_ERROR,
  EMPTY_BOARD_SECTIONS,
  LIVE_DAILY_BOARD_HISTORY,
  LOADING_DAILY_BOARD_HISTORY,
  READY_DAILY_BOARD_ROWS,
} from './daily-board.constants';
import { groupCreatedBySection, listBoardAnimeIds } from './daily-board.helpers';
import type { BoardSections, DailyBoardHistory, DailyBoardView } from './daily-board.types';

/**
 * The history the board renders: live for an open season; for a closed one the
 * Daily board its closure snapshot stored. A source that cannot read the
 * snapshot, or a failed read, is a failure rather than a claim that nothing was
 * recorded; a snapshot without a recorded Daily board is `unrecorded`; a read in
 * flight is `loading`.
 *
 * @param viewSeasonId The closed season being viewed, or null for the open one.
 * @param canRead Whether the source can read the closure snapshot at all.
 * @param snapshot The viewed season's snapshot read.
 * @returns The current history.
 */
export function toDailyBoardHistory(
  viewSeasonId: string | null,
  canRead: boolean,
  snapshot: AsyncView<SeasonOrderingSnapshot>,
): DailyBoardHistory {
  if (viewSeasonId === null) {
    return LIVE_DAILY_BOARD_HISTORY;
  }
  if (!canRead) {
    return { status: 'failed', errorMessage: DAILY_BOARD_HISTORY_LOAD_ERROR };
  }
  if (snapshot.kind === 'failure') {
    return { status: 'failed', errorMessage: snapshot.message };
  }
  if (snapshot.kind !== 'ready') {
    return LOADING_DAILY_BOARD_HISTORY;
  }
  const dailyBoard = snapshot.data.dailyBoard;
  return dailyBoard?.recorded === true ? { status: 'recorded', entries: dailyBoard.entries } : { status: 'unrecorded' };
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
 * Derives the board's render model from the season rows, the history read and
 * the rows read. A rows read that is still running or failed decides the board
 * first, so no section or plain list ever claims a season it has not read; an
 * empty rows read is a read, so the board shows the season without animes.
 *
 * @param rows The season's rows, empty while their read has not answered.
 * @param history Where the Daily board read stands.
 * @param rowsView How the season rows read stands.
 * @returns What the board renders.
 */
export function selectDailyBoardView(
  rows: readonly SeasonAnimeRow[],
  history: DailyBoardHistory,
  rowsView: AsyncView<readonly SeasonAnimeRow[]> = READY_DAILY_BOARD_ROWS,
): DailyBoardView {
  if (rowsView.kind === 'failure') {
    return { mode: 'failed', sections: EMPTY_BOARD_SECTIONS, plainRows: [], boardError: rowsView.message };
  }
  if (rowsView.kind === 'loading') {
    return { mode: 'loading', sections: EMPTY_BOARD_SECTIONS, plainRows: [] };
  }
  switch (history.status) {
    case 'live':
      return { mode: 'sections', sections: groupCreatedBySection(rows), plainRows: [] };
    case 'recorded':
      return { mode: 'sections', sections: groupSnapshotSections(rows, history.entries), plainRows: [] };
    case 'unrecorded':
      return { mode: 'plain', sections: EMPTY_BOARD_SECTIONS, plainRows: rows.filter((row) => row.availability === 'created') };
    case 'failed':
      return { mode: 'failed', sections: EMPTY_BOARD_SECTIONS, plainRows: [], boardError: history.errorMessage };
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
