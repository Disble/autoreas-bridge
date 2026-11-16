import { useCallback } from 'react';
import { BRIDGE_SEASON_SOURCE } from '../query/bridge-runtime/bridge-runtime.constants';
import { useBridgeMutation } from '../query/use-bridge-mutation/use-bridge-mutation';
import { useBridgeQuery } from '../query/use-bridge-query/use-bridge-query';
import { setSeasonStoreState } from '../store/season-store/season-store.helpers';
import { SEASON_CLOSE_FAILED, SEASON_CREATE_FAILED, SEASON_SESSION_GC_TIME } from './season.constants';
import { displayedSeasonRead, runSeasonCommand, settleSeasonCommand, toSeasonBannerMessage } from './season.helpers';
import type { SeasonDataSource, SeasonLifecycleCommands } from './season.types';

/**
 * Creates and closes the season. A refused or failed command shows its text on
 * the shared season banner; a successful one clears the banner and resolves
 * only after the season was read again, the one read it changes.
 * @param source The port the commands and the season read go through.
 * @returns The two commands; each resolves once it settled.
 */
export function useSeasonLifecycleCommands(source: SeasonDataSource = BRIDGE_SEASON_SOURCE): SeasonLifecycleCommands {
  // 4. Queries/Mutations
  const { refetch: refetchSeason } = useBridgeQuery({
    ...displayedSeasonRead(source, null),
    module: 'season',
    gcTime: SEASON_SESSION_GC_TIME,
    enabled: false,
  });
  const { mutateAsync: create } = useBridgeMutation({
    mutationFn: (name: string) => runSeasonCommand(() => source.createSeason(name), SEASON_CREATE_FAILED),
    onSuccess: () => {
      setSeasonStoreState({ errorMessage: undefined });
      return refetchSeason();
    },
    onError: (error) => setSeasonStoreState({ errorMessage: toSeasonBannerMessage(error, { fallback: SEASON_CREATE_FAILED, fixedMessage: false }) }),
  });
  const { mutateAsync: close } = useBridgeMutation({
    mutationFn: () => runSeasonCommand(() => source.closeSeason(), SEASON_CLOSE_FAILED),
    onSuccess: () => {
      setSeasonStoreState({ errorMessage: undefined });
      return refetchSeason();
    },
    onError: (error) => setSeasonStoreState({ errorMessage: toSeasonBannerMessage(error, { fallback: SEASON_CLOSE_FAILED, fixedMessage: false }) }),
  });

  // 6. Callbacks
  const createSeason = useCallback((name: string) => settleSeasonCommand(create(name)), [create]);
  const closeSeason = useCallback(() => settleSeasonCommand(close()), [close]);

  return { createSeason, closeSeason };
}
