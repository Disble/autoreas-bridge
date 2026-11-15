import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { ANIME_LIST_KEY } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
import { classifyAnimeEditorEmptyState, createAnimeEditorListItems, toAnimeEditorDefaultSelection, toEditorErrorMessage } from './anime-editor-workspace.helpers';
import { ANIME_EDITOR_NO_ITEMS } from './anime-editor-workspace.constants';
import type { AnimeEditorFilter, UseAnimeEditorListOptions } from './anime-editor-workspace.types';

/**
 * Owns watching-first catalog loading, filters, search, and selected identity.
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

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const listQuery = useBridgeQuery({ queryKey: ANIME_LIST_KEY, queryFn: () => options.source.getAnimes(), module: 'anime' });

  // 5. Derived State (useMemo)
  const items = listQuery.data ?? ANIME_EDITOR_NO_ITEMS;
  const isLoadingList = listQuery.isPending || listQuery.isFetching;
  const listLoadError = listQuery.status === 'error' && !listQuery.isFetching ? toEditorErrorMessage(listQuery.error) : undefined;
  const itemViewModels = useMemo(() => createAnimeEditorListItems(items, filter, query, selectedAnimeId), [filter, items, query, selectedAnimeId]);
  const emptyState = useMemo(
    () => classifyAnimeEditorEmptyState({ isLoadingList, listLoadError, sourceCount: items.length, visibleCount: itemViewModels.length, query, filter }),
    [filter, isLoadingList, itemViewModels.length, items.length, listLoadError, query],
  );

  // 6. Callbacks (useCallback calling pure helpers)
  const onClearCriteria = useCallback(() => {
    setQuery('');
    setFilter('all');
  }, []);
  const refetchList = listQuery.refetch;
  /** Reads the catalog again, after a save or a lifecycle change moved a row. */
  const loadItems = useCallback(async () => {
    await refetchList();
  }, [refetchList]);
  const onFilterChange = useCallback((value: string) => setFilter(value === 'all' ? 'all' : 'watching'), []);

  // 7. Effects
  useEffect(() => {
    // The first loaded catalog picks the default selection once; a chosen anime is kept.
    if (listQuery.data !== undefined) setSelectedAnimeId((current) => current ?? toAnimeEditorDefaultSelection(listQuery.data));
  }, [listQuery.data]);

  return { query, filter, items: itemViewModels, emptyState, selectedAnimeId, isLoadingList, listLoadError, setQuery, setSelectedAnimeId, onFilterChange, onClearCriteria, loadItems };
}
