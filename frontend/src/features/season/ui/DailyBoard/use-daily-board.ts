import { useCallback, useEffect } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import { seasonSource } from '../../../../infrastructure/season-source/season-source.helpers';
import type { SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import type { SeasonCoverSource } from '../SeasonCoverThumb/season-cover-thumb.types';
import { selectVerHoyRowChip } from './daily-board.helpers';
import { useDailyBoardSend } from './use-daily-board-send';
import { useDailyBoardView } from './use-daily-board-view';

/**
 * useDailyBoard drives the conveyor: created animes grouped by section, the
 * send-and-download flow over the Sin ver pool (`useDailyBoardSend`), and an
 * on-demand availability recheck. Season I/O
 * flows through the season store; `useDailyBoardView` groups the rows and
 * resolves every board row's cover; a closed season's board comes from its
 * closure snapshot (`useDailyBoardView`), never from live sections: the
 * stored sections, or a plain list when the season recorded none.
 *
 * @param source The season port the store reads and writes through.
 * @param coverSource The port each row's cover is resolved through.
 */
export function useDailyBoard(source: SeasonSource = seasonSource, coverSource: SeasonCoverSource = bridgeRuntimeSource) {
  // 3. Context/3rd Party Hooks
  const seasonAnimes = useSeasonStore((state) => state.seasonAnimes);
  const readOnly = useSeasonStore((state) => state.readOnly);
  const errorMessage = useSeasonStore((state) => state.errorMessage);
  const refreshAnimes = useSeasonStore((state) => state.refreshAnimes);
  const recheckAvailability = useSeasonStore((state) => state.recheckAvailability);
  const send = useDailyBoardSend(source);

  // 5. Derived State (useMemo)
  const { view, getCoverThumb } = useDailyBoardView(seasonAnimes, source, coverSource);
  const getVerHoyRowChip = selectVerHoyRowChip(readOnly);
  // A plain arrow, not a useCallback: the button is not memoized, so a stable identity buys nothing.
  const onOpenPage = (pageUrl: string) => source.openPage(pageUrl);

  // 6. Callbacks
  const onRecheck = useCallback(() => {
    void recheckAvailability(source);
  }, [recheckAvailability, source]);

  // 7. Effects
  useEffect(() => {
    void refreshAnimes(source);
  }, [refreshAnimes, source]);

  return {
    readOnly,
    boardMode: view.mode,
    sections: view.sections,
    plainRows: view.plainRows,
    historyError: view.historyError,
    ...send,
    onRecheck,
    onOpenPage,
    errorMessage,
    getCoverThumb,
    getVerHoyRowChip,
  };
}
