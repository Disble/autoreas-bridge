import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { ANIME_LIST_KEY } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
import { hasActiveAnimeEditorCriteria, isAnimeEditorListLoading } from './anime-editor-list.helpers';
import { classifyAnimeEditorEmptyState, createAnimeEditorListItems, toAnimeEditorDefaultSelection, toAnimeEditorListLoadError } from './anime-editor-workspace.helpers';
import { ANIME_EDITOR_NO_ITEMS } from './anime-editor-workspace.constants';
import type { AnimeEditorFilter, UseAnimeEditorListOptions } from './anime-editor-workspace.types';
import { useAnimeEditorFacets } from './use-anime-editor-facets';

/**
 * Owns watching-first catalog loading, the rail lens, the Status and Type
 * filters, search, and selected identity.
 * The catalog reads through the anime module: the rail stays loading while the
 * module starts and shows the failure once it failed, never an empty library.
 */
export function useAnimeEditorList(options: Readonly<UseAnimeEditorListOptions>) {
  // 1. Refs

  // 2. State (the rail filter default is route-derived: read the deep-link param
  // up front so a fresh /editor/:id mount can open on "All anime". useParams is
  // called before the filter state because the initial value depends on it; a
  // later in-app param change never remounts the hook, so the lazy initializer
  // runs once and in-app selections keep the user's chosen toggle.)
  const params = useParams();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AnimeEditorFilter>(() => (params.id === undefined ? 'watching' : 'all'));
  const [selectedAnimeId, setSelectedAnimeId] = useState<string | undefined>(options.initialAnimeId);
  // True while the Editor's own reload (after a save or a lifecycle change) runs.
  const [isReloadingList, setIsReloadingList] = useState(false);

  // 3. Context/3rd Party Hooks
  const { facets, activeFacetCount, onStatusSelectionChange, onKindSelectionChange, onFacetsReset } = useAnimeEditorFacets();

  // 4. Queries/Mutations
  const listQuery = useBridgeQuery({ queryKey: ANIME_LIST_KEY, queryFn: () => options.source.getAnimes(), module: 'anime' });

  // 5. Derived State (useMemo)
  const items = listQuery.data ?? ANIME_EDITOR_NO_ITEMS;
  const isLoadingList = isAnimeEditorListLoading({
    isPending: listQuery.isPending,
    isFetching: listQuery.isFetching,
    hasCatalog: listQuery.data !== undefined,
    isReloading: isReloadingList,
  });
  const listLoadError = toAnimeEditorListLoadError(listQuery);
  const hasActiveCriteria = hasActiveAnimeEditorCriteria(query, filter, facets);
  const itemViewModels = useMemo(() => createAnimeEditorListItems(items, filter, query, selectedAnimeId, facets), [facets, filter, items, query, selectedAnimeId]);
  const emptyState = useMemo(
    () => classifyAnimeEditorEmptyState({ isLoadingList, listLoadError, sourceCount: items.length, visibleCount: itemViewModels.length, hasActiveCriteria }),
    [hasActiveCriteria, isLoadingList, itemViewModels.length, items.length, listLoadError],
  );

  // 6. Callbacks (useCallback calling pure helpers)
  const onClearCriteria = useCallback(() => {
    setQuery('');
    setFilter('all');
    onFacetsReset();
  }, [onFacetsReset]);
  const refetchList = listQuery.refetch;
  /** Reads the catalog again, after a save or a lifecycle change moved a row, behind the skeleton. */
  const loadItems = useCallback(async () => {
    setIsReloadingList(true);
    await refetchList().finally(() => setIsReloadingList(false));
  }, [refetchList]);
  const onFilterChange = useCallback((value: string) => setFilter(value === 'all' ? 'all' : 'watching'), []);

  // 7. Effects
  useEffect(() => {
    // The first loaded catalog picks the default selection once; a chosen anime is kept.
    if (listQuery.data !== undefined) setSelectedAnimeId((current) => current ?? toAnimeEditorDefaultSelection(listQuery.data));
  }, [listQuery.data]);

  return {
    query, filter, facets, activeFacetCount, items: itemViewModels, emptyState, selectedAnimeId, isLoadingList, listLoadError,
    setQuery, setSelectedAnimeId, onFilterChange, onStatusSelectionChange, onKindSelectionChange, onFacetsReset, onClearCriteria, loadItems,
  };
}
