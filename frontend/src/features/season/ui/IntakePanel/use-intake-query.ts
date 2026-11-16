import { useMemo } from 'react';
import type { SeasonQuerySource } from '../../../../shared/contracts/season.types';
import { toAsyncView } from '../../../../shared/query/async-view/async-view.helpers';
import { SEASON_ANIMES_REFRESH_BANNER, SEASON_NO_ROWS } from '../../../../shared/season/season.constants';
import { useDisplayedSeasonAnimes } from '../../../../shared/season/use-displayed-season-animes';
import { useSeasonBannerSync } from '../../../../shared/season/use-season-banner-sync';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import { mergeIntakeMatchingProgress } from './intake-matching-overlay.helpers';

/** Reads intake rows and overlays only the active matching run's event progress. */
export function useIntakeQuery(source: SeasonQuerySource) {
  // 3. Context/third-party hooks
  const progress = useSeasonStore((state) => state.matchingProgress);
  // 4. Queries
  const query = useDisplayedSeasonAnimes({ refresh: 'mount', source });
  // 5. Derived state
  const rows = useMemo(() => mergeIntakeMatchingProgress(query.data ?? SEASON_NO_ROWS, progress), [query.data, progress]);
  const view = query.isError && query.data !== undefined
    ? { kind: 'ready' as const, data: query.data, isRefreshing: query.isFetching }
    : toAsyncView(query);
  // 7. Effects
  useSeasonBannerSync(query, SEASON_ANIMES_REFRESH_BANNER);
  return { rows, view, refetch: query.refetch };
}
