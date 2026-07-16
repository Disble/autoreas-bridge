import { useCallback, useRef, useState } from 'react';
import type { UIEvent } from 'react';
import { ANIME_EDITOR_LIST_INITIAL_COUNT, ANIME_EDITOR_LIST_LOAD_BATCH } from './anime-editor-workspace.constants';
import { isNearListBottom, nextAnimeEditorRenderLimit } from './anime-editor-workspace.helpers';

/** Progressive rail rendering: starts at INITIAL_COUNT rows, appends a batch near the bottom. */
export function useAnimeEditorListWindow(itemCount: number, initialCount = ANIME_EDITOR_LIST_INITIAL_COUNT, batch = ANIME_EDITOR_LIST_LOAD_BATCH) {
  // 1. Refs
  const scrollRef = useRef<HTMLDivElement>(null);

  // 2. State
  const [renderLimit, setRenderLimit] = useState(initialCount);
  const [seenItemCount, setSeenItemCount] = useState(itemCount);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (render-phase reset when the list size changes: filter/search
  // must never inherit a grown render limit — no effect, no extra committed render)
  if (itemCount !== seenItemCount) {
    setSeenItemCount(itemCount);
    setRenderLimit(initialCount);
  }
  const visibleCount = Math.min(renderLimit, itemCount);

  // 6. Callbacks (useCallback calling pure helpers)
  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (isNearListBottom(element.scrollTop, element.clientHeight, element.scrollHeight)) {
      setRenderLimit((current) => nextAnimeEditorRenderLimit(current, batch, itemCount));
    }
  }, [batch, itemCount]);

  // 7. Effects

  return { scrollRef, onScroll, visibleCount };
}
