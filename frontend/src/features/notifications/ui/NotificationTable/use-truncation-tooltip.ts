import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/** What `useTruncationTooltip` returns: the ref to attach and whether the tooltip should stay disabled. */
export interface TruncationTooltipResult {
  readonly ref: RefObject<HTMLSpanElement | null>;
  readonly isDisabled: boolean;
}

/**
 * Measures whether an element's text is ACTUALLY truncated
 * (`scrollWidth > clientWidth`) so the wrapping `Tooltip` only ever appears
 * when there is more text to reveal (design.md §9.2). Recomputes on every
 * render since the measurement is cheap and the row's own content (or its
 * column width) can change without the ref identity changing.
 */
export function useTruncationTooltip(): TruncationTooltipResult {
  // 1. Refs
  const ref = useRef<HTMLSpanElement | null>(null);

  // 2. State
  const [isDisabled, setIsDisabled] = useState(true);

  // 7. Effects
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    setIsDisabled(element.scrollWidth <= element.clientWidth);
  });

  return { ref, isDisabled };
}
