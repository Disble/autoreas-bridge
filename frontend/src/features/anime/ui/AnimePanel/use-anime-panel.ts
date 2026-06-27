import { useCallback, useEffect, useMemo, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source';
import type { Anime } from '../../../../shared/contracts/anime.types';
import { useDebounce } from '../../../../shared/hooks/use-debounce';
import {
  ANIME_ACTIVO_OPTIONS,
  ANIME_ESTADO_OPTIONS,
  ANIME_FILTER_ALL_VALUE,
  ANIME_FILTER_DEBOUNCE_MS,
  ANIME_GAP_OPTIONS,
  ANIME_LEGACY_PULL_FAILED_RESULT,
} from './anime-panel.constants';
import {
  filterAnimes,
  getUniqueDiaOptions,
  getUniqueGeneroOptions,
  getUniqueTipoOptions,
  sortAnimesByName,
  toAnimeViewModel,
} from './anime-panel.helpers';
import type { AnimeFilterState, AnimePanelProps, AnimePanelState, AnimeViewModel } from './anime-panel.types';

/** Drives the AnimePanel by fetching the full anime catalog from the runtime. */
export function useAnimePanel(
  _props: Readonly<AnimePanelProps>,
  source: BridgeRuntimeSource = bridgeRuntimeSource,
): AnimePanelState {
  // 1. Refs

  // 2. State
  const [items, setItems] = useState<readonly Anime[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPullingFromLegacy, setIsPullingFromLegacy] = useState(false);
  const [pullResult, setPullResult] = useState<AnimePanelState['pullResult']>(undefined);
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
  const tipoOptions = useMemo(() => getUniqueTipoOptions(items), [items]);
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
  const onPullFromLegacy = useCallback(async () => {
    setIsPullingFromLegacy(true);

    try {
      const nextPullResult = await source.pullAnimesFromLegacy();
      setPullResult(nextPullResult);

      if (nextPullResult.status === 'ok') {
        const nextItems = await source.getAnimes();
        setItems(nextItems);
      }
    } catch {
      setPullResult(ANIME_LEGACY_PULL_FAILED_RESULT);
    } finally {
      setIsPullingFromLegacy(false);
    }
  }, [source]);

  // 7. Effects
  useEffect(() => {
    let active = true;

    setIsLoading(true);

    void source
      .getAnimes()
      .then((nextItems) => {
        if (!active) {
          return;
        }

        setItems(nextItems);
        setIsLoading(false);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setItems([]);
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [source]);

  return {
    items: viewItems,
    isLoading,
    isEmpty,
    filters,
    estadoOptions: ANIME_ESTADO_OPTIONS,
    activoOptions: ANIME_ACTIVO_OPTIONS,
    tipoOptions,
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
    onPullFromLegacy,
    isPullingFromLegacy,
    pullResult,
  };
}
