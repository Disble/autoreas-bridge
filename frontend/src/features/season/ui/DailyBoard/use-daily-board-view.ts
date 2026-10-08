import type { SeasonAnimeRow, SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import type { SeasonCoverSource, SeasonCoverThumbProps } from '../SeasonCoverThumb/season-cover-thumb.types';
import type { DailyBoardView } from './daily-board.types';
import { useDailyBoardHistory } from './use-daily-board-history';
import { useDailyBoardSections } from './use-daily-board-sections';

/**
 * The board's render model for the season on screen: live sections for the
 * open season, the closure snapshot's board for a closed one, plus one cover
 * per rendered anime.
 *
 * @param rows The season's rows, as the season store holds them.
 * @param source The season port a closed season's snapshot is read through.
 * @param coverSource The port each row's cover is resolved through.
 * @returns The render model, and the thumbnail props for an anime id.
 */
export function useDailyBoardView(
  rows: readonly SeasonAnimeRow[],
  source: SeasonSource,
  coverSource: SeasonCoverSource,
): { readonly view: DailyBoardView; readonly getCoverThumb: (animeId: string) => SeasonCoverThumbProps } {
  // 3. Context/3rd Party Hooks
  const history = useDailyBoardHistory(source);

  // 5. Derived State
  return useDailyBoardSections(rows, coverSource, history);
}
