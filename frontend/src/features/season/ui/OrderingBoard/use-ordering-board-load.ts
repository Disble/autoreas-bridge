import { useCallback, useEffect, useState } from 'react';
import type { OrderingBoard } from '../../../../infrastructure/season-source/season-source.types';
import { EMPTY_ORDERING_BOARD, ORDERING_HISTORY_LOAD_ERROR } from './ordering-board.constants';
import { applyOrderingDraft, initialWorkingState } from './ordering-board.helpers';
import type { OrderingBoardLoadParams, OrderingBoardLoadResult, OrderingBoardOrigin, WorkingState } from './ordering-board.types';

/**
 * Loads the live schedule (with its saved draft restored), or one past season's
 * stored closure snapshot, into the board's editable working state, and reloads whenever the source or viewed season
 * changes. A source that cannot read the stored board is reported as a failure, never
 * as a season that recorded nothing.
 * @returns The loaded board, working state and its setter, historical load flags and error, and `load`.
 */
export function useOrderingBoardLoad({ source, viewSeasonId }: Readonly<OrderingBoardLoadParams>): OrderingBoardLoadResult {
  // 2. State
  const [board, setBoard] = useState<OrderingBoard>(EMPTY_ORDERING_BOARD);
  const [state, setState] = useState<WorkingState>({ order: {}, instances: {} });
  const [origin, setOrigin] = useState<OrderingBoardOrigin>({ seasonId: null, recorded: true });
  const [historicalError, setHistoricalError] = useState<string | undefined>(undefined);

  // 5. Derived State
  // The stored board is unresolved until `origin` names the season being viewed,
  // so a slow read can never show an empty rail/grid as if it were the record.
  const isHistoricalLoading = viewSeasonId !== null && origin.seasonId !== viewSeasonId;
  const historicalRecorded = origin.recorded;

  // 6. Callbacks
  const load = useCallback(async () => {
    if (viewSeasonId === null) {
      const loaded = await source.getOrderingBoard();
      // `board` stays the applied schedule, the baseline changes are counted
      // against; only the editable state starts from the saved draft.
      setBoard(loaded);
      setState(initialWorkingState(applyOrderingDraft(loaded)));
      setOrigin({ seasonId: null, recorded: true });
      setHistoricalError(undefined);
      return;
    }
    try {
      if (source.getSeasonOrderingSnapshot === undefined) {
        // A source that cannot read the stored board must not claim this season
        // recorded nothing: an absent capability is an unavailable read, and the
        // surface shows a failure instead of a historical statement it cannot make.
        setOrigin({ seasonId: viewSeasonId, recorded: false });
        setHistoricalError(ORDERING_HISTORY_LOAD_ERROR);
        return;
      }
      const snapshot = await source.getSeasonOrderingSnapshot(viewSeasonId);
      const stored: OrderingBoard = { rail: snapshot.rail, grid: snapshot.grid, appliedAt: snapshot.appliedAt };
      setBoard(stored);
      setState(initialWorkingState(stored));
      setOrigin({ seasonId: viewSeasonId, recorded: snapshot.recorded });
      setHistoricalError(undefined);
    } catch (error) {
      setOrigin({ seasonId: viewSeasonId, recorded: false });
      setHistoricalError(error instanceof Error ? error.message : ORDERING_HISTORY_LOAD_ERROR);
    }
  }, [source, viewSeasonId]);

  // 7. Effects
  useEffect(() => {
    void load();
  }, [load]);

  return { board, state, setState, isHistoricalLoading, historicalRecorded, historicalError, load };
}
