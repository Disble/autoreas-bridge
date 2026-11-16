import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SeasonAnimeRow, SeasonQuerySource, SeasonSnapshot } from '../contracts/season.types';
import { BRIDGE_SEASON_SOURCE } from '../query/bridge-runtime/bridge-runtime.constants';
import { useBridgeQuery } from '../query/use-bridge-query/use-bridge-query';
import { setSeasonStoreState } from '../store/season-store/season-store.helpers';
import { SEASON_LIVE_VIEW_STATE, SEASON_SESSION_GC_TIME } from './season.constants';
import { displayedSeasonAnimesRead, displayedSeasonRead, resolvePastSeasonLoad } from './season.helpers';
import type { PastSeasonView } from './season.types';

/**
 * Enters and leaves the read-only view of a past season. Entering reads the
 * season and its rows first and switches the view (the store's `viewSeasonId`)
 * only once both loaded, so the live view stays on screen meanwhile and stays
 * after a failed read, whose text reaches the banner. Leaving returns to the
 * live season and reads it again.
 * @param source The port the reads go through.
 * @returns The two view transitions.
 */
export function usePastSeasonView(source: SeasonQuerySource = BRIDGE_SEASON_SOURCE): PastSeasonView {
  // 2. State
  const [pendingSeasonId, setPendingSeasonId] = useState<string | null>(null);

  // 4. Queries/Mutations
  const isPending = pendingSeasonId !== null;
  const pastSeason = useBridgeQuery<SeasonSnapshot | null>({
    ...displayedSeasonRead(source, pendingSeasonId ?? ''),
    module: 'season',
    gcTime: SEASON_SESSION_GC_TIME,
    enabled: isPending,
  });
  const pastAnimes = useBridgeQuery<readonly SeasonAnimeRow[]>({
    ...displayedSeasonAnimesRead(source, pendingSeasonId ?? ''),
    module: 'season',
    gcTime: SEASON_SESSION_GC_TIME,
    enabled: isPending,
  });
  const { refetch: refetchSeason } = useBridgeQuery({
    ...displayedSeasonRead(source, null),
    module: 'season',
    gcTime: SEASON_SESSION_GC_TIME,
    enabled: false,
  });

  // 5. Derived State
  const outcome = useMemo(
    () => (pendingSeasonId === null ? null : resolvePastSeasonLoad(pendingSeasonId, { season: pastSeason, animes: pastAnimes })),
    [pendingSeasonId, pastSeason, pastAnimes],
  );

  // 6. Callbacks
  const viewPastSeason = useCallback((seasonId: string) => setPendingSeasonId(seasonId), []);
  const exitPastSeason = useCallback(async () => {
    setSeasonStoreState(SEASON_LIVE_VIEW_STATE);
    await refetchSeason();
  }, [refetchSeason]);

  // 7. Effects
  useEffect(() => {
    if (outcome === null || outcome.kind === 'waiting') {
      return;
    }
    setSeasonStoreState(outcome.kind === 'ready' ? outcome.state : { errorMessage: outcome.errorMessage });
    setPendingSeasonId(null);
  }, [outcome]);

  return { viewPastSeason, exitPastSeason };
}
