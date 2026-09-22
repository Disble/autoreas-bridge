import type { RefCallback } from 'react';

/**
 * Inputs for one rail's virtual window over its loaded rows.
 *
 * The hook is rail-agnostic: it owns the virtualizer, the deterministic
 * viewport fallback, the load-more trigger and the head-insertion offset
 * compensation, while each rail keeps only what is genuinely its own — the
 * detection of its own head insertions (`prependCount`) and the layout
 * constants it passes in.
 */
export interface VirtualRailWindowInput<T> {
  /** Every row the rail has loaded so far, newest-first: pages at the tail, live pushes at the head. */
  readonly items: readonly T[];
  /** Constant estimated height of one row in px; the spacer math is exact for this estimated layout. */
  readonly estimateSizePx: number;
  /** Rows the virtual window renders beyond each visible edge. */
  readonly overscan: number;
  /**
   * Rows that entered at the HEAD since the previous pass; 0 for a tail
   * append, a page load or an in-place update. Each rail detects its own head
   * insertions — a capture push, a runtime-event push and a filter reload are
   * rail-specific shapes of the same question.
   */
  readonly prependCount: number;
  /** Called when the virtual range reaches the last loaded row, so the next page can be fetched. */
  readonly onReachEnd: () => void;
}

/** What the virtual window hands the dumb table: in-view rows, spacer heights, and the scroll ref. */
export interface VirtualRailWindowModel<T> {
  /** The rows the virtualizer reports in view (plus overscan). */
  readonly visibleItems: readonly T[];
  /** Height in px of the unrendered content above the window; 0 when the window starts at the first row. */
  readonly topSpacerHeightPx: number;
  /** Height in px of the unrendered content below the window; 0 when the window ends at the last row. */
  readonly bottomSpacerHeightPx: number;
  /** Attaches to the rail's scroll container so the virtualizer can observe its rect and offset. */
  readonly scrollRef: RefCallback<HTMLDivElement>;
}
