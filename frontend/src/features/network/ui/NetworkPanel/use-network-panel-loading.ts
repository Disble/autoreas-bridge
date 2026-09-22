import { useState } from 'react';
import type { RuntimeEventRow } from './network-panel.types';

/** Everything the rail's asynchronous status needs from its caller. */
interface NetworkPanelLoadingInput {
  /** Rows of the merged persisted+overlay feed, the truth for "is anything on screen". */
  readonly feedRows: readonly RuntimeEventRow[];
}

/** The rail's asynchronous query status, resolved for rendering and reporting. */
interface NetworkPanelLoadingState {
  /** The source answered but is degraded; the view model turns it into the rail's degraded banner. */
  readonly degraded: boolean;
  /** Nothing to show yet: the skeleton placeholder. */
  readonly hasNothingToShow: boolean;
  /** Rows are on screen and a settled query is in flight: keep rows, show the hint. */
  readonly isUpdating: boolean;
  /** Marks the settled query in flight; the async edges in `use-network-panel-sync` report through it. */
  readonly setLoading: (isLoading: boolean) => void;
  /** Records the degraded flag of the last settled query response. */
  readonly setDegraded: (degraded: boolean) => void;
}

/**
 * Owns the rail's asynchronous query status: the raw in-flight flag, the
 * degraded-source flag of the last settled query, and the two loading meanings
 * derived from the merged feed length rather than the page alone (the live
 * overlay can hold rows while the page is empty). `hasNothingToShow` is
 * "nothing to show yet": the skeleton placeholder. `isUpdating` is "a settled
 * filter query is in flight while rows are on screen": the rail keeps its rows
 * and shows the updating hint instead, so a keystroke burst never swaps the
 * rows for skeletons. Split out of `useNetworkPanel` so the status contract and
 * its state live in one named home.
 * @param input The merged feed rows the two loading meanings are resolved from.
 * @returns The resolved loading flags, the degraded flag, and the reporting setters.
 */
export function useNetworkPanelLoading(input: Readonly<NetworkPanelLoadingInput>): NetworkPanelLoadingState {
  const { feedRows } = input;

  // 2. State
  // The raw flags the async edges report: whether a settled query is in
  // flight, and whether its last response came from a degraded source.
  const [isLoading, setIsLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);

  // 5. Derived State (useMemo)
  /** Whether any row of the merged feed is on screen. */
  const hasFeedRows = feedRows.length > 0;
  const isUpdating = isLoading && hasFeedRows;
  const hasNothingToShow = isLoading && !hasFeedRows;

  return { degraded, hasNothingToShow, isUpdating, setDegraded, setLoading: setIsLoading };
}
