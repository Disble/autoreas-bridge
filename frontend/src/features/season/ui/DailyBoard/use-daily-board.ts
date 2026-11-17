import { useCallback } from 'react';
import type { SeasonAnimeRow, SeasonQuerySource, SeasonSource } from '../../../../shared/contracts/season.types';
import { toAsyncView } from '../../../../shared/query/async-view/async-view.helpers';
import type { AsyncView } from '../../../../shared/query/async-view/async-view.types';
import { BRIDGE_ANIME_SOURCE, BRIDGE_SEASON_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { SEASON_ANIMES_REFRESH_BANNER, SEASON_NO_ROWS } from '../../../../shared/season/season.constants';
import { runSeasonCommand, settleSeasonCommand, toSeasonBannerMessage } from '../../../../shared/season/season.helpers';
import { useDisplayedSeasonAnimes } from '../../../../shared/season/use-displayed-season-animes';
import { useSeasonBannerSync } from '../../../../shared/season/use-season-banner-sync';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import { setSeasonStoreState } from '../../../../shared/store/season-store/season-store.helpers';
import type { SeasonCoverSource } from '../SeasonCoverThumb/season-cover-thumb.types';
import { selectVerHoyRowChip } from './daily-board.helpers';
import { DAILY_BOARD_RECHECK_BUSY, DAILY_BOARD_RECHECK_FAILED } from './daily-board.constants';
import { useDailyBoardSend } from './use-daily-board-send';
import { useDailyBoardView } from './use-daily-board-view';
import { useVerHoyDownload } from './use-ver-hoy-download';

/**
 * useDailyBoard drives the conveyor: created animes grouped by section, the
 * send-and-download flow over the Sin ver pool (`useDailyBoardSend`), the
 * checked-subset download over Ver hoy (`useVerHoyDownload`, whose refusal
 * shows as the board's error), and an on-demand availability recheck. The rows
 * come from the shared season query the screen shows (the open season's, or the
 * past season the store is viewing), so the board never claims a season it has
 * not read: a read still running shows its placeholder, a failed one shows its
 * message, and an editable season with no created anime shows its empty state.
 * `useDailyBoardView` groups the rows and resolves every board row's cover; a
 * closed season's board comes from its closure snapshot, never from live
 * sections.
 *
 * @param source The season query and command port.
 * @param coverSource The port each row's cover is resolved through.
 */
export function useDailyBoard(
  source: SeasonSource & SeasonQuerySource = BRIDGE_SEASON_SOURCE,
  coverSource: SeasonCoverSource = BRIDGE_ANIME_SOURCE,
) {
  // 3. Context/3rd Party Hooks
  const readOnly = useSeasonStore((state) => state.readOnly);
  const errorMessage = useSeasonStore((state) => state.errorMessage);

  // 4. Queries/Mutations
  const animes = useDisplayedSeasonAnimes({ refresh: 'mount', source });
  const recheck = useBridgeMutation({
    mutationFn: () => runSeasonCommand(() => source.recheckAvailability(), DAILY_BOARD_RECHECK_FAILED),
    onMutate: () => setSeasonStoreState({ busyMessage: DAILY_BOARD_RECHECK_BUSY }),
    onSettled: () => setSeasonStoreState({ busyMessage: undefined }),
    onSuccess: async () => {
      setSeasonStoreState({ errorMessage: undefined });
      await animes.refetch();
    },
    onError: (error) => setSeasonStoreState({ errorMessage: toSeasonBannerMessage(error, { fallback: DAILY_BOARD_RECHECK_FAILED, fixedMessage: false }) }),
  });
  useSeasonBannerSync(animes, SEASON_ANIMES_REFRESH_BANNER);
  const send = useDailyBoardSend(source);

  // 5. Derived State
  const rows = animes.isPlaceholderData ? SEASON_NO_ROWS : animes.data ?? SEASON_NO_ROWS;
  const rowsView: AsyncView<readonly SeasonAnimeRow[]> = animes.isPlaceholderData
    ? { kind: 'loading' }
    : toAsyncView(animes);
  const { view, getCoverThumb } = useDailyBoardView(rows, rowsView, source, coverSource);
  const { downloadError, ...verHoyDownload } = useVerHoyDownload(source, view.sections.verHoy);
  const getVerHoyRowChip = selectVerHoyRowChip(readOnly);
  // A plain arrow, not a useCallback: the button is not memoized, so a stable identity buys nothing.
  const onOpenPage = (pageUrl: string) => source.openPage(pageUrl);

  // 6. Callbacks
  // A failed recheck keeps the loaded rows on screen: its mutation already put the failure on the banner.
  const onRecheck = useCallback(() => {
    if (!readOnly) void settleSeasonCommand(recheck.mutateAsync());
  }, [readOnly, recheck]);

  return {
    readOnly,
    boardMode: view.mode,
    sections: view.sections,
    plainRows: view.plainRows,
    boardError: view.boardError,
    ...send,
    ...verHoyDownload,
    onRecheck,
    onOpenPage,
    errorMessage: downloadError ?? errorMessage,
    getCoverThumb,
    getVerHoyRowChip,
  };
}
