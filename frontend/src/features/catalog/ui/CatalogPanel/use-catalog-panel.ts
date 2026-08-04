import { useCallback, useMemo, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import type { Anime } from '../../../../shared/contracts/anime.types';
import { useAsyncList } from '../../../../shared/hooks/use-async-list/use-async-list';
import { useDebounce } from '../../../../shared/hooks/use-debounce';
import { useProgressiveListWindow } from '../../../../shared/hooks/use-progressive-list-window';
import {
  ANIME_ACTIVO_OPTIONS,
  ANIME_ESTADO_OPTIONS,
  ANIME_FILTER_ALL_VALUE,
  ANIME_FILTER_DEBOUNCE_MS,
  ANIME_GAP_OPTIONS,
  ANIME_TIPO_OPTIONS,
} from './catalog-panel.constants';
import {
  filterAnimes,
  getUniqueDiaOptions,
  getUniqueGeneroOptions,
  sortAnimesByName,
  toAnimeViewModel,
} from './catalog-panel.helpers';
import type { AnimeFilterState, CatalogPanelProps, CatalogPanelState, AnimeViewModel } from './catalog-panel.types';

/** Drives the CatalogPanel by fetching the full anime catalog from the runtime. */
export function useCatalogPanel(
  _props: Readonly<CatalogPanelProps>,
  source: BridgeRuntimeSource = bridgeRuntimeSource,
): CatalogPanelState {
  // 1. Refs

  // 2. State
  const [filters, setFilters] = useState<AnimeFilterState>({
    query: '',
    estado: ANIME_FILTER_ALL_VALUE,
    activo: ANIME_FILTER_ALL_VALUE,
    tipo: ANIME_FILTER_ALL_VALUE,
    dia: ANIME_FILTER_ALL_VALUE,
    generos: [],
    gap: ANIME_FILTER_ALL_VALUE,
  });

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const { items, isLoading } = useAsyncList<Anime>(() => source.getAnimes(), source);

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
  const isEmpty = useMemo(() => !isLoading && viewItems.length === 0, [isLoading, viewItems.length]);
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
  const onQueryChange = useCallback((query: string) => {
    setFilters((previous) => ({ ...previous, query }));
  }, []);
  const onEstadoChange = useCallback((estado: string) => {
    setFilters((previous) => ({ ...previous, estado }));
  }, []);
  const onActivoChange = useCallback((activo: string) => {
    setFilters((previous) => ({ ...previous, activo }));
  }, []);
  const onTipoChange = useCallback((tipo: string) => {
    setFilters((previous) => ({ ...previous, tipo }));
  }, []);
  const onDiaChange = useCallback((dia: string) => {
    setFilters((previous) => ({ ...previous, dia }));
  }, []);
  const onGenerosChange = useCallback((values: readonly (string | number)[]) => {
    const generos = values.map((value) => (typeof value === 'number' ? String(value) : value));

    setFilters((previous) => ({ ...previous, generos }));
  }, []);
  const onGapChange = useCallback((gap: string) => {
    setFilters((previous) => ({ ...previous, gap }));
  }, []);

  // 7. Effects

  return {
    items: visibleItems,
    isLoading,
    isEmpty,
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
  };
}
