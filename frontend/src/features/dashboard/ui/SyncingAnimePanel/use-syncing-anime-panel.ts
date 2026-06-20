import { useEffect, useMemo, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source';
import type { SyncingAnime } from '../../../../shared/contracts/syncing-anime.types';
import type { SyncingAnimePanelProps } from './syncing-anime-panel.types';
import { toSyncingAnimePanelViewModel } from './syncing-anime-panel.helpers';

/** Drives the syncing-anime panel by fetching pending queue items from the runtime. */
export function useSyncingAnimePanel(
  props: Readonly<SyncingAnimePanelProps>,
  source: BridgeRuntimeSource = bridgeRuntimeSource,
) {
  // 1. Refs

  // 2. State
  const [items, setItems] = useState<readonly SyncingAnime[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const viewItems = useMemo(() => items.map(toSyncingAnimePanelViewModel), [items]);
  const isEmpty = useMemo(() => !isLoading && viewItems.length === 0, [isLoading, viewItems.length]);

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects
  useEffect(() => {
    let active = true;

    setIsLoading(true);

    void source
      .getSyncingAnimeItems()
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
  }, [props.refreshToken, source]);

  return {
    items: viewItems,
    isLoading,
    isEmpty,
  };
}
