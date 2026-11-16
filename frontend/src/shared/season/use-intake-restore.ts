import { useCallback } from 'react';
import type { SeasonQuerySource, SeasonSource } from '../contracts/season.types';
import { BRIDGE_SEASON_SOURCE } from '../query/bridge-runtime/bridge-runtime.constants';
import { useBridgeMutation } from '../query/use-bridge-mutation/use-bridge-mutation';
import { useBridgeQuery } from '../query/use-bridge-query/use-bridge-query';
import { getSeasonStoreState, setSeasonStoreState } from '../store/season-store/season-store.helpers';
import { SEASON_SESSION_GC_TIME } from './season.constants';
import { displayedSeasonAnimesRead, runSeasonCommand, toSeasonBannerMessage } from './season.helpers';

/** Restores a discarded row, then reads the live rows before resolving. */
export function useIntakeRestore(source: SeasonQuerySource & Pick<SeasonSource, 'restoreName'> = BRIDGE_SEASON_SOURCE) {
  // 4. Queries/Mutations
  const { refetch } = useBridgeQuery({ ...displayedSeasonAnimesRead(source, null), module: 'season', gcTime: SEASON_SESSION_GC_TIME, enabled: false });
  const { mutateAsync } = useBridgeMutation({
    mutationFn: (rowId: string) => runSeasonCommand(() => source.restoreName(rowId), 'Failed to restore name'),
    onSuccess: async () => {
      setSeasonStoreState({ errorMessage: undefined });
      await refetch();
    },
    onError: (error) => setSeasonStoreState({ errorMessage: toSeasonBannerMessage(error, { fallback: 'Failed to restore name', fixedMessage: false }) }),
  });

  // 6. Callbacks
  return useCallback(async (rowId: string): Promise<boolean> => {
    if (getSeasonStoreState().readOnly) return false;
    try {
      await mutateAsync(rowId);
      return true;
    } catch {
      return false;
    }
  }, [mutateAsync]);
}
