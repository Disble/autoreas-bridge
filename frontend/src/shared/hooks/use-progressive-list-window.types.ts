import type { RefObject, UIEvent } from 'react';

/**
 * Scroll wiring returned by `useProgressiveListWindow`. Attach `scrollRef` and
 * `onScroll` to the height-bounded scroll container and render
 * `items.slice(0, visibleCount)` inside it. See `docs/adr/012-progressive-list-rendering.md`.
 */
export interface ProgressiveListWindow {
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly onScroll: (event: UIEvent<HTMLDivElement>) => void;
  readonly visibleCount: number;
}
