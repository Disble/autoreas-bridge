import { useMemo } from 'react';
import type { SeasonAnimeRow } from '../../../../shared/contracts/season.types';
import type { AsyncView } from '../../../../shared/query/async-view/async-view.types';
import type { SeasonCoverSource, SeasonCoverThumbProps } from '../SeasonCoverThumb/season-cover-thumb.types';
import { useSeasonCovers } from '../SeasonCoverThumb/use-season-covers';
import { listViewAnimeIds, selectDailyBoardView } from './daily-board-history.helpers';
import { LIVE_DAILY_BOARD_HISTORY, READY_DAILY_BOARD_ROWS } from './daily-board.constants';
import type { DailyBoardHistory, DailyBoardView } from './daily-board.types';

/**
 * Derives the board's render model from the season's rows, how their read
 * stands, and the Daily board history (live sections in an open season; the
 * stored board, a plain list, the loading or the failed read in a closed one)
 * and resolves one cover per rendered anime through the shared season cover seam.
 *
 * @param rows The season's rows, as their read answered.
 * @param source The port `getAnimeCover` is called through. Its absence (a
 * non-Wails context) degrades every requested id to the placeholder.
 * @param history Where the Daily board read stands; live by default.
 * @param rowsView How the season rows read stands; ready by default, for callers
 * that already hold the rows.
 * @returns The render model, and the thumbnail props for an anime id.
 */
export function useDailyBoardSections(
  rows: readonly SeasonAnimeRow[],
  source: SeasonCoverSource,
  history: DailyBoardHistory = LIVE_DAILY_BOARD_HISTORY,
  rowsView: AsyncView<readonly SeasonAnimeRow[]> = READY_DAILY_BOARD_ROWS,
): { readonly view: DailyBoardView; readonly getCoverThumb: (animeId: string) => SeasonCoverThumbProps } {
  // 5. Derived State (useMemo)
  const view = useMemo(() => selectDailyBoardView(rows, history, rowsView), [rows, history, rowsView]);
  const animeIds = useMemo(() => listViewAnimeIds(view), [view]);
  const getCoverThumb = useSeasonCovers(animeIds, source);

  return { view, getCoverThumb };
}
