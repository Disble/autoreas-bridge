/**
 * Window returned by `usePageProgressiveWindow`: render `items.slice(0, visibleCount)`
 * in normal page flow. See `docs/adr/012-progressive-list-rendering.md`.
 */
export interface PageProgressiveWindow {
  readonly visibleCount: number;
}
