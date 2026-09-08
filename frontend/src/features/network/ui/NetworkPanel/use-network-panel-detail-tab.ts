import { useCallback, useEffect, useRef, useState } from 'react';
import type { NetworkDetailTab } from './network-panel.types';

/**
 * Owns the DevTools-style detail inspector's active tab.
 *
 * The tab always resets to "general" the moment the selection changes, so
 * switching rows never leaves a stale tab (e.g. "trace") selected for an
 * event that has no such data. Split out of `useNetworkPanel` together with
 * the ref and effect that back it: a lone `detailTab` state left the reset
 * effect's ref bookkeeping as one more concern in an already crowded
 * composition hook.
 * @param selectedId Id of the currently selected row, or null when none is selected.
 * @returns The active tab and the change handler the inspector's tab strip calls.
 */
export function useNetworkPanelDetailTab(selectedId: string | null) {
  // 1. Refs
  const previousSelectedIdRef = useRef<string | null>(null);

  // 2. State
  const [detailTab, setDetailTab] = useState<NetworkDetailTab>('general');

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const onDetailTabChange = useCallback((nextTab: NetworkDetailTab) => setDetailTab(nextTab), []);

  // 7. Effects
  useEffect(() => {
    if (previousSelectedIdRef.current !== selectedId) {
      previousSelectedIdRef.current = selectedId;
      setDetailTab('general');
    }
  }, [selectedId]);

  return { detailTab, onDetailTabChange };
}
