import { useCallback, useRef, useState } from 'react';
import type { UIEvent } from 'react';
import { PROGRESSIVE_LIST_INITIAL_COUNT, PROGRESSIVE_LIST_LOAD_BATCH } from '../constants/progressive-list.constants';
import { isNearListBottom, nextRenderLimit } from '../helpers/progressive-list.helpers';

/**
 * Progressive rail rendering for large selectable lists: starts at INITIAL_COUNT
 * rows and appends a batch when the user scrolls near the bottom. Rows are never
 * unmounted, so the scrollbar starts short and grows — which reads honestly,
 * unlike windowing's full-height padded track (see autoreas-theme changelog 1.0.11).
 */
export function useProgressiveListWindow(
  itemCount: number,
  initialCount = PROGRESSIVE_LIST_INITIAL_COUNT,
  batch = PROGRESSIVE_LIST_LOAD_BATCH,
) {
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
      setRenderLimit((current) => nextRenderLimit(current, batch, itemCount));
    }
  }, [batch, itemCount]);

  // 7. Effects

  return { scrollRef, onScroll, visibleCount };
}
