import { useEffect, useState } from 'react';
import type { SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import { readDailyBoardHistory, resolveDailyBoardHistory } from './daily-board-history.helpers';
import type { DailyBoardHistory, LoadedDailyBoardHistory } from './daily-board.types';

/**
 * Reads the Daily board a closed season stored at close, once per season the
 * season store is viewing. An open season (no viewed season) is `live` and
 * reads nothing. A read that settles after the viewed season changed is
 * dropped, so one season never shows another's board.
 *
 * @param source The season port the closure snapshot is read through.
 * @returns Where the Daily board read stands.
 */
export function useDailyBoardHistory(source: SeasonSource): DailyBoardHistory {
  // 2. State
  const [loaded, setLoaded] = useState<LoadedDailyBoardHistory | null>(null);

  // 3. Context/3rd Party Hooks
  const viewSeasonId = useSeasonStore((state) => state.viewSeasonId);

  // 5. Derived State
  const history = resolveDailyBoardHistory(viewSeasonId, loaded);

  // 7. Effects
  useEffect(() => {
    if (viewSeasonId === null) {
      return undefined;
    }
    let isCurrent = true;
    void readDailyBoardHistory(source, viewSeasonId).then((result) => {
      if (isCurrent) {
        setLoaded(result);
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [source, viewSeasonId]);

  return history;
}
