import { useMemo } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import type { Anime } from '../../../../shared/contracts/anime.types';
import { useAsyncList } from '../../../../shared/hooks/use-async-list/use-async-list';
import { useDebounce } from '../../../../shared/hooks/use-debounce';
import { useProgressiveListWindow } from '../../../../shared/hooks/use-progressive-list-window';
import {
  ANIME_ACTIVO_OPTIONS,
  ANIME_ESTADO_OPTIONS,
  ANIME_FILTER_DEBOUNCE_MS,
  ANIME_GAP_OPTIONS,
  ANIME_TIPO_OPTIONS,
} from './catalog-panel.constants';
import {
  classifyCatalogEmptyState,
  filterAnimes,
  getUniqueDiaOptions,
  getUniqueGeneroOptions,
  sortAnimesByName,
  toAnimeViewModel,
} from './catalog-panel.helpers';
import type { CatalogPanelProps, CatalogPanelState, AnimeFilterState, AnimeViewModel } from './catalog-panel.types';
import { useCatalogFilters } from './use-catalog-filters';

/** Drives the CatalogPanel by fetching the full anime catalog from the runtime. */
export function useCatalogPanel(
  _props: Readonly<CatalogPanelProps>,
  source: BridgeRuntimeSource = bridgeRuntimeSource,
): CatalogPanelState {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks
  const { filters, onQueryChange, onEstadoChange, onActivoChange, onTipoChange, onDiaChange, onGenerosChange, onGapChange, onClearCriteria } = useCatalogFilters();

  // 4. Queries/Mutations
  const { items, isLoading, error } = useAsyncList<Anime>(() => source.getAnimes(), source);

  // 5. Derived State (useMemo)
  const debouncedQuery = useDebounce(filters.query, ANIME_FILTER_DEBOUNCE_MS);
  const activeFilters = useMemo<AnimeFilterState>(
    () => ({ ...filters, query: debouncedQuery }),
    [filters, debouncedQuery],
  );
  const filteredItems = useMemo<readonly Anime[]>(
    () => filterAnimes(items, activeFilters).toSorted(sortAnimesByName),
    [items, activeFilters],
  );
  const viewItems = useMemo<readonly AnimeViewModel[]>(
    () => filteredItems.map(toAnimeViewModel),
    [filteredItems],
  );
  const emptyState = useMemo(
    () => classifyCatalogEmptyState({
      isLoading,
      hasError: error !== undefined,
      sourceCount: items.length,
      visibleCount: viewItems.length,
      filters: activeFilters,
    }),
    [activeFilters, error, isLoading, items.length, viewItems.length],
  );
  // Static list (ADR-012): the count only moves when a filter or the search
  // changes, which is exactly when restarting at the first batch is correct.
  const listWindow = useProgressiveListWindow(viewItems.length);
  const visibleItems = useMemo(
    () => viewItems.slice(0, listWindow.visibleCount),
    [viewItems, listWindow.visibleCount],
  );
  const diaOptions = useMemo(() => getUniqueDiaOptions(items), [items]);
  const generoOptions = useMemo(() => getUniqueGeneroOptions(items), [items]);

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects

  return {
    items: visibleItems,
    isLoading,
    error,
    emptyState,
    listWindow,
    filters,
    estadoOptions: ANIME_ESTADO_OPTIONS,
    activoOptions: ANIME_ACTIVO_OPTIONS,
    tipoOptions: ANIME_TIPO_OPTIONS,
    diaOptions,
    generoOptions,
    gapOptions: ANIME_GAP_OPTIONS,
    onQueryChange,
    onEstadoChange,
    onActivoChange,
    onTipoChange,
    onDiaChange,
    onGenerosChange,
    onGapChange,
    onClearCriteria,
  };
}
