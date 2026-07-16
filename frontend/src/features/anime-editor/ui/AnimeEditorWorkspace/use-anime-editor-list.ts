import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import type { Anime } from '../../../../shared/contracts/anime.types';
import { isWatchingAnime } from '../../../../shared/helpers/anime-estado.helpers';
import { createAnimeEditorListItems } from './anime-editor-workspace.helpers';
import type { AnimeEditorFilter, UseAnimeEditorListOptions } from './anime-editor-workspace.types';

/** Owns watching-first catalog loading, filters, search, and selected identity. */
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
  const [items, setItems] = useState<readonly Anime[]>([]);
  const [selectedAnimeId, setSelectedAnimeId] = useState<string | undefined>(options.initialAnimeId);
  const [isLoadingList, setIsLoadingList] = useState(true);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const itemViewModels = useMemo(() => createAnimeEditorListItems(items, filter, query, selectedAnimeId), [filter, items, query, selectedAnimeId]);

  // 6. Callbacks (useCallback calling pure helpers)
  const loadItems = useCallback(async () => {
    setIsLoadingList(true);
    try {
      const loaded = await options.source.getAnimes();
      setItems(loaded);
      setSelectedAnimeId((current) => current ?? loaded.find((anime) => isWatchingAnime(anime))?.id ?? loaded[0]?.id);
    } finally {
      setIsLoadingList(false);
    }
  }, [options.source]);
  const onFilterChange = useCallback((value: string) => setFilter(value === 'all' ? 'all' : 'watching'), []);

  // 7. Effects
  useEffect(() => { void loadItems(); }, [loadItems]);

  return { query, filter, items: itemViewModels, selectedAnimeId, isLoadingList, setQuery, setSelectedAnimeId, onFilterChange, loadItems };
}
