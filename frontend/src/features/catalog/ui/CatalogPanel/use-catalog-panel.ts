import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import type { AnimeSource } from '../../../../shared/contracts/anime-source.types';
import { useDebounce } from '../../../../shared/hooks/use-debounce';
import { usePageProgressiveWindow } from '../../../../shared/hooks/use-page-progressive-window';
import { ANIME_CREATE_ROUTE } from '../../../../shared/navigation/app-layout.constants';
import { toAsyncView } from '../../../../shared/query/async-view/async-view.helpers';
import { BRIDGE_ANIME_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { ANIME_LIST_KEY } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
import { CATALOG_KIND_OPTIONS, CATALOG_QUERY_DEBOUNCE_MS, CATALOG_SORT_OPTIONS, CATALOG_STATUS_OPTIONS } from './catalog-panel.constants';
import {
  classifyCatalogEmptyState,
  compareCatalogAnimes,
  countActiveCatalogFilters,
  filterCatalogAnimes,
  getCatalogGenreOptions,
  hasActiveCatalogCriteria,
  toCatalogCriterionChips,
  toCatalogItemViewModel,
  toCatalogLoad,
} from './catalog-panel.helpers';
import type { CatalogCriteria, CatalogItemViewModel, CatalogPanelState } from './catalog-panel.types';
import { useCatalogCovers } from './use-catalog-covers';
import { useCatalogCriteria } from './use-catalog-criteria';

/**
 * Drives the CatalogPanel: reads the catalog through the `anime` module (the
 * skeleton stays while it starts, its failure shows the Alert), applies the
 * criteria and sort, and windows the result.
 */
export function useCatalogPanel(source: AnimeSource = BRIDGE_ANIME_SOURCE): CatalogPanelState {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks
  const navigate = useNavigate();
  const criteriaState = useCatalogCriteria();
  const { criteria, sort } = criteriaState;

  // 4. Queries/Mutations
  const query = useBridgeQuery({ queryKey: ANIME_LIST_KEY, queryFn: () => source.getAnimes(), module: 'anime' });

  // 5. Derived State (useMemo)
  const { items, isLoading, error } = toCatalogLoad(toAsyncView(query));
  const debouncedQuery = useDebounce(criteria.query, CATALOG_QUERY_DEBOUNCE_MS);
  const appliedCriteria = useMemo<CatalogCriteria>(() => ({ ...criteria, query: debouncedQuery }), [criteria, debouncedQuery]);
  const matchingItems = useMemo<readonly CatalogItemViewModel[]>(
    () => filterCatalogAnimes(items, appliedCriteria).toSorted(compareCatalogAnimes(sort)).map(toCatalogItemViewModel),
    [appliedCriteria, items, sort],
  );
  const emptyState = classifyCatalogEmptyState({
    isLoading,
    hasError: error !== undefined,
    sourceCount: items.length,
    visibleCount: matchingItems.length,
    criteria: appliedCriteria,
  });
  // Static list (ADR-012): the count only moves when the search or a filter
  // changes, which is exactly when restarting at the first batch is correct.
  const listWindow = usePageProgressiveWindow(matchingItems.length);
  const windowItems = useMemo(() => matchingItems.slice(0, listWindow.visibleCount), [matchingItems, listWindow.visibleCount]);
  const covers = useCatalogCovers(windowItems, source);
  const genreOptions = useMemo(() => getCatalogGenreOptions(items), [items]);
  const criterionChips = useMemo(() => toCatalogCriterionChips(criteria), [criteria]);

  // 6. Callbacks (useCallback calling pure helpers)
  const onCreate = useCallback(() => void navigate(ANIME_CREATE_ROUTE), [navigate]);

  // 7. Effects

  return {
    ...criteriaState,
    ...covers,
    isLoading,
    error,
    emptyState,
    hasCatalog: isLoading || error !== undefined || items.length > 0,
    totalCount: items.length,
    matchingCount: matchingItems.length,
    items: windowItems,
    listWindow,
    activeFilterCount: countActiveCatalogFilters(criteria),
    criterionChips,
    hasCriteria: hasActiveCatalogCriteria(criteria),
    statusOptions: CATALOG_STATUS_OPTIONS,
    kindOptions: CATALOG_KIND_OPTIONS,
    genreOptions,
    sortOptions: CATALOG_SORT_OPTIONS,
    onCreate,
  };
}
