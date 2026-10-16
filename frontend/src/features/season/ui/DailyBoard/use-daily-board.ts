import { useCallback, useEffect, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import { seasonSource } from '../../../../infrastructure/season-source/season-source.helpers';
import type { SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import type { SeasonCoverSource } from '../SeasonCoverThumb/season-cover-thumb.types';
import { selectVerHoyRowChip } from './daily-board.helpers';
import { useDailyBoardView } from './use-daily-board-view';

/**
 * useDailyBoard drives the conveyor: created animes grouped by section, a
 * multi-select over the Sin ver pool to send today's batch to Ver hoy (which
 * downloads automatically), and an on-demand availability recheck. Season I/O
 * flows through the season store; `useDailyBoardView` groups the rows and
 * resolves every board row's cover; a closed season's board comes from its
 * closure snapshot (`useDailyBoardView`), never from live sections: the
 * stored sections, or a plain list when the season recorded none.
 *
 * @param source The season port the store reads and writes through.
 * @param coverSource The port each row's cover is resolved through.
 */
export function useDailyBoard(source: SeasonSource = seasonSource, coverSource: SeasonCoverSource = bridgeRuntimeSource) {
  // 2. State
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Set when a batch is sent after the daily auto-download window: prompts a manual download.
  const [downloadNotice, setDownloadNotice] = useState<{ readonly downloadTime: string } | null>(null);

  // 3. Context/3rd Party Hooks
  const seasonAnimes = useSeasonStore((state) => state.seasonAnimes);
  const readOnly = useSeasonStore((state) => state.readOnly);
  const errorMessage = useSeasonStore((state) => state.errorMessage);
  const refreshAnimes = useSeasonStore((state) => state.refreshAnimes);
  const sendToVerHoy = useSeasonStore((state) => state.sendToVerHoy);
  const recheckAvailability = useSeasonStore((state) => state.recheckAvailability);

  // 5. Derived State (useMemo)
  const { view, getCoverThumb } = useDailyBoardView(seasonAnimes, source, coverSource);
  const getVerHoyRowChip = selectVerHoyRowChip(readOnly);
  // A plain arrow, not a useCallback: the button is not memoized, so a stable identity buys nothing.
  const onOpenPage = (pageUrl: string) => source.openPage(pageUrl);

  // 6. Callbacks
  const toggleSelect = useCallback((animeId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(animeId)) {
        next.delete(animeId);
      } else {
        next.add(animeId);
      }
      return next;
    });
  }, []);
  const onSendToVerHoy = useCallback(() => {
    if (selected.size === 0) {
      return;
    }
    const ids = [...selected];
    setSelected(new Set());
    void sendToVerHoy(source, ids).then((result) => {
      setDownloadNotice(result.pastDownloadTime ? { downloadTime: result.downloadTime } : null);
    });
  }, [selected, sendToVerHoy, source]);
  const onDownloadNow = useCallback(() => {
    setDownloadNotice(null);
    void source.triggerSeasonDownloads();
  }, [source]);
  const onDismissNotice = useCallback(() => {
    setDownloadNotice(null);
  }, []);
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
    selected,
    toggleSelect,
    onSendToVerHoy,
    downloadNotice,
    onDownloadNow,
    onDismissNotice,
    onRecheck,
    onOpenPage,
    errorMessage,
    getCoverThumb,
    getVerHoyRowChip,
  };
}
