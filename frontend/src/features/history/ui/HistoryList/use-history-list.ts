import { useEffect, useMemo, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source';
import { loadHistoryEntries } from './history-list.helpers';
import type { HistoryEntryViewModel, HistoryListProps, HistoryListState } from './history-list.types';

/**
 * Drives the read-only HistoryList: delegates to `loadHistoryEntries`
 * (fetch/enrich pipeline in history-list.helpers.ts) and exposes only
 * rendered entries. No mutation callable is returned -- History is
 * read-only, and drill-down to detail is a `Link` (routing composition) in
 * the dumb component, not a hook callable.
 */
export function useHistoryList(
  _props: Readonly<HistoryListProps>,
  source: BridgeRuntimeSource = bridgeRuntimeSource,
): HistoryListState {
  // 1. Refs

  // 2. State
  const [items, setItems] = useState<readonly HistoryEntryViewModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const isEmpty = useMemo(() => !isLoading && items.length === 0, [isLoading, items.length]);

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects
  useEffect(() => {
    let active = true;

    setIsLoading(true);

    void loadHistoryEntries(source)
      .then((nextItems) => {
        if (!active) {
          return;
        }

        setItems(nextItems);
        setIsLoading(false);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setItems([]);
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [source]);

  return {
    items,
    isLoading,
    isEmpty,
  };
}
