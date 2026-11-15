import { useMemo } from 'react';
import type { AnimeSource } from '../../../../shared/contracts/anime-source.types';
import { BRIDGE_ANIME_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { ANIME_LIST_KEY } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
import { resolveHistoryAnimeScope, toHistoryCatalogLoad } from './history-timeline.helpers';
import type { HistoryAnimeScopeLoadState } from './history-timeline.types';

/**
 * Reads the anime catalog through the `anime` module (the catalog query the
 * Catalog screen shares) and resolves the active Status/Type filter against it
 * (design D2), so `useHistoryTimeline` itself only has to read the result.
 * Returns `undefined` until the catalog has resolved, also while the module
 * starts. A failed read remains an explicit error, so the History surface never
 * renders a failed read as empty.
 *
 * @param status The active Status filter, or `undefined` for "All".
 * @param type The active Type filter, or `undefined` for "All".
 * @param source The anime port the catalog is read through.
 * @returns The catalog, the resolved scope and the failure.
 */
export function useHistoryAnimeScope(
  status: number | undefined,
  type: number | undefined,
  source: AnimeSource = BRIDGE_ANIME_SOURCE,
): HistoryAnimeScopeLoadState {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const query = useBridgeQuery({ queryKey: ANIME_LIST_KEY, queryFn: () => source.getAnimes(), module: 'anime' });

  // 5. Derived State (useMemo)
  const { status: queryStatus, data, error: queryError } = query;
  const { catalog, error } = useMemo(
    () => toHistoryCatalogLoad({ status: queryStatus, data, error: queryError, isFetching: false }),
    [queryStatus, data, queryError],
  );
  const scope = useMemo(
    () => (catalog === undefined ? undefined : resolveHistoryAnimeScope(catalog, status, type)),
    [catalog, status, type],
  );

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects

  return { catalog, scope, error };
}
