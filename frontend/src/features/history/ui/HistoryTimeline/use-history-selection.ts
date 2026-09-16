import { useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';
import { findHistoryTimelineEntry, resolveEventRowKey, resolveHistorySelectedKey } from './history-timeline.helpers';
import type { HistorySelectionState, HistoryTimelineGroup } from './history-timeline.types';

/**
 * Binds the History `ListBox` selection to the URL (design D5, D7): a
 * replace-mode selection writes `anime`/`row` through `setSelection`, and the
 * row action (Enter or a double-click) opens that row's anime detail. The
 * highlighted key is derived from the URL, so Back restores it.
 *
 * An open gesture resolves its row from the DOM event target, never the
 * settled selection: a double-click's two clicks outrun the URL round-trip.
 * Opening also arms a one-shot suppress for the selection echo React Aria
 * fires after the gesture (Enter selects on keydown after our capture
 * handler already navigated to the detail); the echo would navigate back to
 * `/history` and clobber the detail. Only the echo of the opened row is
 * skipped -- any other selection is processed and disarms the suppress, so
 * no genuine selection is ever swallowed.
 */
export function useHistorySelection(
  groups: readonly HistoryTimelineGroup[],
  animeId: string | undefined,
  rowId: number | undefined,
  setSelection: (animeId: string | undefined, rowId: number | undefined) => void,
): HistorySelectionState {
  // 1. Refs
  const openedRowRef = useRef<number | undefined>(undefined);

  // 3. Context/3rd Party Hooks
  const navigate = useNavigate();

  // 5. Derived State (useMemo)
  const selectedKey = useMemo(() => resolveHistorySelectedKey(groups, animeId, rowId), [groups, animeId, rowId]);

  // 6. Callbacks (useCallback calling pure helpers)
  const onSelect = useCallback(
    (key: string | number | undefined) => {
      const entry = findHistoryTimelineEntry(groups, key);

      if (openedRowRef.current !== undefined) {
        const openedRow = openedRowRef.current;
        openedRowRef.current = undefined;
        if (entry?.id === openedRow) {
          return;
        }
      }

      if (entry !== undefined) {
        setSelection(entry.animeId, entry.id);
      }
    },
    [groups, setSelection],
  );
  const onOpen = useCallback(
    (key: string | number) => {
      const entry = findHistoryTimelineEntry(groups, key);

      if (entry !== undefined) {
        void navigate(`/catalog/detail/${entry.animeId}`);
      }
    },
    [groups, navigate],
  );
  const onOpenTarget = useCallback(
    (target: unknown) => {
      const key = resolveEventRowKey(target, groups) ?? selectedKey;

      if (key === undefined) {
        return;
      }
      const entry = findHistoryTimelineEntry(groups, key);

      if (entry === undefined) {
        return;
      }
      openedRowRef.current = entry.id;
      setSelection(entry.animeId, entry.id);
      void navigate(`/catalog/detail/${entry.animeId}`);
    },
    [groups, navigate, selectedKey, setSelection],
  );

  return { selectedKey, onSelect, onOpen, onOpenTarget };
}
