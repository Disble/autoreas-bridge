import { useEffect, useState } from 'react';
import { PROGRESSIVE_LIST_INITIAL_COUNT, PROGRESSIVE_LIST_LOAD_BATCH } from '../constants/progressive-list.constants';
import { isNearListBottom, nextRenderLimit } from '../helpers/progressive-list.helpers';
import type { PageProgressiveWindow } from './use-page-progressive-window.types';

/**
 * Progressive rendering for a list that flows with the page instead of a
 * height-bounded pane: the document is the element that scrolls, so the
 * trigger listens on `window` (ADR-012: wire the trigger on what actually
 * scrolls). Rows are never unmounted and appending raises no scroll event, so
 * it cannot page itself to exhaustion.
 */
export function usePageProgressiveWindow(
  itemCount: number,
  initialCount = PROGRESSIVE_LIST_INITIAL_COUNT,
  batch = PROGRESSIVE_LIST_LOAD_BATCH,
): PageProgressiveWindow {
  // 1. Refs

  // 2. State
  const [renderLimit, setRenderLimit] = useState(initialCount);
  const [seenItemCount, setSeenItemCount] = useState(itemCount);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (render-phase reset: a new search or filter never inherits a grown limit)
  if (itemCount !== seenItemCount) {
    setSeenItemCount(itemCount);
    setRenderLimit(initialCount);
  }
  const visibleCount = Math.min(renderLimit, itemCount);

  // 6. Callbacks

  // 7. Effects
  useEffect(() => {
    const onScroll = () => {
      const page = document.documentElement;
      if (isNearListBottom(window.scrollY, window.innerHeight, page.scrollHeight)) {
        setRenderLimit((current) => nextRenderLimit(current, batch, itemCount));
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [batch, itemCount]);

  return { visibleCount };
}
