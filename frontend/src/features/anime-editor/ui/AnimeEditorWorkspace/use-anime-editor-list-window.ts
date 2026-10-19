import { useMemo } from 'react';
import { useProgressiveListWindow } from '../../../../shared/hooks/use-progressive-list-window';
import { ANIME_EDITOR_LIST_INITIAL_COUNT, ANIME_EDITOR_LIST_LOAD_BATCH } from './anime-editor-workspace.constants';

/**
 * Progressive rail rendering: starts at INITIAL_COUNT rows, appends a batch near the bottom.
 * The window keeps its identity until a part of it changes, so the memoized list panel that
 * reads it skips the renders where nothing in the window moved.
 */
export function useAnimeEditorListWindow(itemCount: number, initialCount = ANIME_EDITOR_LIST_INITIAL_COUNT, batch = ANIME_EDITOR_LIST_LOAD_BATCH) {
  const { scrollRef, onScroll, visibleCount } = useProgressiveListWindow(itemCount, initialCount, batch);
  return useMemo(() => ({ scrollRef, onScroll, visibleCount }), [scrollRef, onScroll, visibleCount]);
}
