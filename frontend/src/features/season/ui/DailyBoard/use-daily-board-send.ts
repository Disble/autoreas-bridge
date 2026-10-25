import { useCallback, useState } from 'react';
import type { SeasonSource, SendToVerHoyResult } from '../../../../infrastructure/season-source/season-source.types';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import { toggleSelection } from './daily-board.helpers';

/**
 * useDailyBoardSend owns the Daily board's download flow: the multi-select over
 * the Sin ver pool, sending it to Ver hoy (which downloads at the scheduled
 * time, or at once through "Send & download now"), the late-send notice, and
 * the manual season download. Downloads only consume the season port's
 * `triggerSeasonDownloads`; the download run reports its own progress through
 * notifications.
 *
 * @param source The season port the batch is sent and the download started through.
 */
export function useDailyBoardSend(source: SeasonSource) {
  // 2. State
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Set when a batch is sent after the daily auto-download window: prompts a manual download.
  const [downloadNotice, setDownloadNotice] = useState<{ readonly downloadTime: string } | null>(null);

  // 3. Context/3rd Party Hooks
  const sendToVerHoy = useSeasonStore((state) => state.sendToVerHoy);

  // 6. Callbacks
  const toggleSelect = useCallback((animeId: string) => {
    setSelected((prev) => toggleSelection(prev, animeId));
  }, []);
  // Sends the selection to Ver hoy and clears it; resolves null when nothing was selected.
  const sendSelection = useCallback(async (): Promise<SendToVerHoyResult | null> => {
    if (selected.size === 0) {
      return null;
    }
    const ids = [...selected];
    setSelected(new Set());
    return sendToVerHoy(source, ids);
  }, [selected, sendToVerHoy, source]);
  const onSendToVerHoy = useCallback(() => {
    void sendSelection().then((result) => {
      if (result !== null) {
        setDownloadNotice(result.pastDownloadTime ? { downloadTime: result.downloadTime } : null);
      }
    });
  }, [sendSelection]);
  // The download starts at once, so a missed auto-download window needs no notice.
  const onSendAndDownload = useCallback(() => {
    void sendSelection().then((result) => {
      if (result?.status !== 'ok') {
        return;
      }
      setDownloadNotice(null);
      void source.triggerSeasonDownloads();
    });
  }, [sendSelection, source]);
  const onDownloadNow = useCallback(() => {
    setDownloadNotice(null);
    void source.triggerSeasonDownloads();
  }, [source]);
  const onDismissNotice = useCallback(() => {
    setDownloadNotice(null);
  }, []);

  return {
    selected,
    toggleSelect,
    onSendToVerHoy,
    onSendAndDownload,
    downloadNotice,
    onDownloadNow,
    onDismissNotice,
  };
}
