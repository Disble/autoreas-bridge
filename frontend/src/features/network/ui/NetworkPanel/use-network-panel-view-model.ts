import { useMemo } from 'react';
import {
  getNetworkPanelRows,
  getNetworkPanelSelection,
  getNetworkPanelSummary,
  resolveEventEmptyMessage,
  resolveEventStatusMessage,
} from './network-panel.helpers';
import type { RuntimeEventRow } from './network-panel.types';

/** Everything the rail's row/selection/status projection needs to read. */
interface NetworkPanelViewModelInput {
  /** The currently windowed slice, rendered as table rows. */
  readonly visibleRows: readonly RuntimeEventRow[];
  /** The full merged feed, used to resolve the selection independent of the window. */
  readonly feedRows: readonly RuntimeEventRow[];
  readonly selectedId: string | null;
  readonly traceSiblings: readonly RuntimeEventRow[];
  readonly available: boolean;
  readonly degraded: boolean;
}

/**
 * Projects the merged feed into everything the dumb UI renders: the visible
 * table rows, the selected event's detail, the disclosure banner text, and
 * the status-bar counters.
 *
 * Grouped into one hook because these are one concern — "the feed, as this
 * rail's UI sees it" — not several independent `useMemo`s composed loosely
 * inside `useNetworkPanel`.
 * @param input The windowed rows, the full feed, selection, siblings and store health flags.
 * @returns The table rows, the selection payload, the disclosure copy, and the status-bar counters.
 */
export function useNetworkPanelViewModel(input: Readonly<NetworkPanelViewModelInput>) {
  const { visibleRows, feedRows, selectedId, traceSiblings, available, degraded } = input;

  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const rows = useMemo(() => getNetworkPanelRows(visibleRows), [visibleRows]);
  const { selectedEntry, selectedDetail } = useMemo(
    () => getNetworkPanelSelection(feedRows, selectedId, traceSiblings),
    [feedRows, selectedId, traceSiblings],
  );
  const statusMessage = resolveEventStatusMessage(available, degraded);
  const emptyMessage = resolveEventEmptyMessage(statusMessage);
  const { entryCount, errorCount, shownCount } = useMemo(
    () => getNetworkPanelSummary(feedRows, rows.length),
    [feedRows, rows.length],
  );

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects

  return { rows, selectedEntry, selectedDetail, statusMessage, emptyMessage, entryCount, errorCount, shownCount };
}
