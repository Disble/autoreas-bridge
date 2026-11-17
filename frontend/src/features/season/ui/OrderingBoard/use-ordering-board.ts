import { useCallback, useEffect } from 'react';
import type { AnimeDesktopActionsSource } from '../../../../shared/contracts/anime-editor-source.types';
import type { ApplyScheduleResult, SeasonSource } from '../../../../shared/contracts/season.types';
import {
  BRIDGE_ANIME_DESKTOP_ACTIONS_SOURCE,
  BRIDGE_ANIME_SOURCE,
  BRIDGE_SEASON_SOURCE,
} from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { toSeasonBannerMessage } from '../../../../shared/season/season.helpers';
import { setSeasonStoreState } from '../../../../shared/store/season-store/season-store.helpers';
import { useSeasonDesktopActions } from '../../desktop-actions/use-season-desktop-actions';
import type { SeasonCoverSource } from '../SeasonCoverThumb/season-cover-thumb.types';
import { useSeasonCovers } from '../SeasonCoverThumb/use-season-covers';
import { ORDERING_APPLY_FAILED, ORDERING_DUPLICATE_WEEKDAY_ERROR, ORDERING_EMPTY_DRAFT } from './ordering-board.constants';
import {
  hasDuplicateWeekdayPlacements,
  isOrderingBoardReadOnly,
  serializeDraft,
  toOrderingBoardErrorMessage,
} from './ordering-board.helpers';
import { useOrderingBoardDerived } from './use-ordering-board-derived';
import { useOrderingBoardAutosave } from './use-ordering-board-autosave';
import { useOrderingBoardEdits } from './use-ordering-board-edits';
import { useOrderingBoardLoad } from './use-ordering-board-load';
import { useOrderingBoardStoreBindings } from './use-ordering-board-store-bindings';

/**
 * useOrderingBoard drives the weekday scheduling board on @dnd-kit/react: it loads the
 * board into an editable working state (per-container instance keys), reshuffles it live
 * as cards are dragged via the `move` helper (rejecting a second copy on one day),
 * exposes Duplicate/Delete, and autosaves the draft (debounced) once the user edits it; a
 * reload restores that draft. Apply saves + reconciles the schedule; Reset discards the
 * draft; Reopen makes an applied board editable again. Each command runs through
 * `useBridgeMutation` and then re-reads the live board; a rejected apply shows
 * its message on the season banner and a successful one clears it. All
 * derivation is pure. Covers resolve once per anime on the loaded board.
 *
 * @param source The season port the board reads and writes through.
 * @param coverSource The port each card's cover is resolved through.
 * @param desktopActionsSource The anime module's port the cards open or copy a page or folder through.
 */
export function useOrderingBoard(
  source: SeasonSource = BRIDGE_SEASON_SOURCE,
  coverSource: SeasonCoverSource = BRIDGE_ANIME_SOURCE,
  desktopActionsSource: AnimeDesktopActionsSource = BRIDGE_ANIME_DESKTOP_ACTIONS_SOURCE,
) {
  // 3. Context/3rd Party Hooks
  const {
    closeSeason,
    readOnly: isPastSeason,
    viewSeasonId,
    seasonAnimes,
    ensureAnimesLoaded,
    errorMessage,
  } = useOrderingBoardStoreBindings();
  const { board, state, setState, isHistoricalLoading, historicalRecorded, historicalError, isLiveLoading, liveError, load } =
    useOrderingBoardLoad({ source, viewSeasonId });
  const { meta, animeIds, rail, columns, counts, changeCount, scheduledCount, hasInvalidWeekdayPlacements } =
    useOrderingBoardDerived({ board, state, seasonAnimes });
  const { hasEdits, clearEdits, onDragOver, duplicate, removeCard } = useOrderingBoardEdits({ state, setState });
  const desktopActions = useSeasonDesktopActions(desktopActionsSource);
  const getCoverThumb = useSeasonCovers(animeIds, coverSource);

  // 4. Queries/Mutations
  const { mutate: autosaveDraft, mutateAsync: saveDraft } = useBridgeMutation({
    mutationFn: (draftJson: string) => source.saveOrderingDraft(draftJson),
  });
  const { mutateAsync: applySchedule } = useBridgeMutation({
    mutationFn: () => source.applySchedule(),
    onSuccess: () => setSeasonStoreState({ errorMessage: undefined }),
    onError: (error) => setSeasonStoreState({ errorMessage: toSeasonBannerMessage(error, { fallback: ORDERING_APPLY_FAILED, fixedMessage: false }) }),
  });
  const { mutateAsync: reopenOrdering } = useBridgeMutation({ mutationFn: () => source.reopenOrdering() });

  // 5. Derived State
  // A past season (viewed from history) locks the board just like an applied one.
  const readOnly = isOrderingBoardReadOnly(board, isPastSeason);

  // 6. Callbacks
  // Resolves `undefined` when the apply rejected: its mutation already showed why on the banner,
  // and the board still reloads, since the anime written before the failure stay written.
  const onApply = useCallback(async (): Promise<ApplyScheduleResult | undefined> => {
    if (hasDuplicateWeekdayPlacements(state)) {
      return { status: ORDERING_DUPLICATE_WEEKDAY_ERROR, applied: 0, failed: [] };
    }
    await saveDraft(serializeDraft(state));
    const result = await applySchedule().catch(() => undefined);
    clearEdits();
    await load();
    return result;
  }, [saveDraft, applySchedule, state, load, clearEdits]);
  // Reset clears the saved draft too, or the reload would restore the edits it discards.
  const onReset = useCallback(() => {
    clearEdits();
    void saveDraft(ORDERING_EMPTY_DRAFT).then(load);
  }, [saveDraft, load, clearEdits]);
  const onReopen = useCallback(async () => {
    await reopenOrdering();
    clearEdits();
    await load();
  }, [reopenOrdering, load, clearEdits]);
  const onCloseSeason = useCallback(() => {
    void closeSeason();
  }, [closeSeason]);

  // 7. Effects
  // Grade + desktop actions come from the season selection rows; the displayed
  // rows read owns loading them, so this resolves at once and only marks intent.
  useEffect(() => {
    void ensureAnimesLoaded();
  }, [ensureAnimesLoaded]);
  useOrderingBoardAutosave({ saveDraft: autosaveDraft, state, hasEdits, readOnly, hasInvalidWeekdayPlacements });

  return {
    rail,
    columns,
    meta,
    instances: state.instances,
    counts,
    changeCount,
    scheduledCount,
    hasInvalidWeekdayPlacements,
    readOnly,
    isPastSeason,
    isHistoricalLoading,
    historicalRecorded,
    historicalError,
    isLiveLoading,
    liveError,
    errorMessage: toOrderingBoardErrorMessage(errorMessage, liveError),
    onDragOver,
    duplicate,
    removeCard,
    onApply,
    onReset,
    onReopen,
    onCloseSeason,
    getCoverThumb,
    ...desktopActions,
  };
}
