import { useCallback, useState } from 'react';
import type { SeasonQuerySource, SeasonSource, SendToVerHoyResult } from '../../../../shared/contracts/season.types';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { settleSeasonCommand, toSeasonBannerMessage } from '../../../../shared/season/season.helpers';
import { useDisplayedSeasonAnimes } from '../../../../shared/season/use-displayed-season-animes';
import { setSeasonStoreState } from '../../../../shared/store/season-store/season-store.helpers';
import {
  DAILY_BOARD_DOWNLOAD_FAILED,
  DAILY_BOARD_SEND_BUSY,
  DAILY_BOARD_SEND_FAILED,
} from './daily-board.constants';
import { toggleSelection } from './daily-board.helpers';

/**
 * useDailyBoardSend owns the Daily board's download flow: the multi-select over
 * the Sin ver pool, sending it to Ver hoy (which downloads at the scheduled
 * time, or at once through "Send & download now"), the late-send notice, and
 * the manual season download. Every command runs as a bridge mutation: a sent
 * batch refreshes the season rows it moved, a download that could not start
 * shows why in the season banner, and a started run reports its own progress
 * through notifications.
 *
 * @param source The season port the batch is sent and the download started through.
 */
export function useDailyBoardSend(source: SeasonSource & SeasonQuerySource) {
  // 2. State
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Set when a batch is sent after the daily auto-download window: prompts a manual download.
  const [downloadNotice, setDownloadNotice] = useState<{ readonly downloadTime: string } | null>(null);

  // 4. Queries/Mutations
  const { refetch: refetchAnimes } = useDisplayedSeasonAnimes({ refresh: 'never', source });
  const send = useBridgeMutation({
    mutationFn: (animeIds: readonly string[]) => source.sendToVerHoy(animeIds),
    onMutate: () => setSeasonStoreState({ busyMessage: DAILY_BOARD_SEND_BUSY }),
    onSettled: () => setSeasonStoreState({ busyMessage: undefined }),
    onSuccess: async (result) => {
      if (result.status !== 'ok') {
        setSeasonStoreState({ errorMessage: result.status || DAILY_BOARD_SEND_FAILED });
        return;
      }
      setSeasonStoreState({ errorMessage: undefined });
      await refetchAnimes();
    },
    onError: (error) => setSeasonStoreState({ errorMessage: toSeasonBannerMessage(error, { fallback: DAILY_BOARD_SEND_FAILED, fixedMessage: false }) }),
  });
  const download = useBridgeMutation({
    mutationFn: () => source.triggerSeasonDownloads(),
    onError: (error) => setSeasonStoreState({ errorMessage: toSeasonBannerMessage(error, { fallback: DAILY_BOARD_DOWNLOAD_FAILED, fixedMessage: false }) }),
  });

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
    try {
      return await send.mutateAsync(ids);
    } catch (error) {
      return { status: toSeasonBannerMessage(error, { fallback: DAILY_BOARD_SEND_FAILED, fixedMessage: false }), pastDownloadTime: false, downloadTime: '' };
    }
  }, [selected, send]);
  /** Starts the season download in the background; the run reports itself, a refusal reaches the banner. */
  const startDownload = useCallback(() => settleSeasonCommand(download.mutateAsync()), [download]);
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
      startDownload();
    });
  }, [sendSelection, startDownload]);
  const onDownloadNow = useCallback(() => {
    setDownloadNotice(null);
    startDownload();
  }, [startDownload]);
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
