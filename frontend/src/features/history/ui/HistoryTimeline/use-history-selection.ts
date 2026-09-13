import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { findHistoryTimelineEntry, resolveHistorySelectedKey } from './history-timeline.helpers';
import type { HistorySelectionState, HistoryTimelineGroup } from './history-timeline.types';

/**
 * Binds the History `ListBox` selection to the URL (design D5, D7): a
 * replace-mode selection writes `anime`/`row` through `setSelection`, and the
 * row action (Enter or a double-click) opens that row's anime detail. The
 * highlighted key is derived from the URL, so Back restores it.
 */
export function useHistorySelection(
  groups: readonly HistoryTimelineGroup[],
  animeId: string | undefined,
  rowId: number | undefined,
  setSelection: (animeId: string | undefined, rowId: number | undefined) => void,
): HistorySelectionState {
  // 3. Context/3rd Party Hooks
  const navigate = useNavigate();

  // 5. Derived State (useMemo)
  const selectedKey = useMemo(() => resolveHistorySelectedKey(groups, animeId, rowId), [groups, animeId, rowId]);

  // 6. Callbacks (useCallback calling pure helpers)
  const onSelect = useCallback(
    (key: string | number | undefined) => {
      const entry = findHistoryTimelineEntry(groups, key);

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

  return { selectedKey, onSelect, onOpen };
}
