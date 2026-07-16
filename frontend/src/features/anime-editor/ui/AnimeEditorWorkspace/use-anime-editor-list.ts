import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Anime } from '../../../../shared/contracts/anime.types';
import { isWatchingAnime } from '../../../../shared/helpers/anime-estado.helpers';
import { createAnimeEditorListItems } from './anime-editor-workspace.helpers';
import type { AnimeEditorFilter, UseAnimeEditorListOptions } from './anime-editor-workspace.types';

/** Owns watching-first catalog loading, filters, search, and selected identity. */
export function useAnimeEditorList(options: Readonly<UseAnimeEditorListOptions>) {
  // 1. Refs

  // 2. State
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AnimeEditorFilter>('watching');
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
