import { useMemo } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import type { SyncingAnime } from '../../../../shared/contracts/syncing-anime.types';
import { useAsyncList } from '../../../../shared/hooks/use-async-list/use-async-list';
import type { SyncingAnimePanelProps } from './syncing-anime-panel.types';
import { toSyncingAnimePanelViewModel } from './syncing-anime-panel.helpers';

/** Drives the syncing-anime panel by fetching pending queue items from the runtime. */
export function useSyncingAnimePanel(
  props: Readonly<SyncingAnimePanelProps>,
  source: BridgeRuntimeSource = bridgeRuntimeSource,
) {
  // 1. Refs

  // 2. State
  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const { items, isLoading } = useAsyncList<SyncingAnime>(
    () => source.getSyncingAnimeItems(),
    props.refreshToken,
    source,
  );

  // 5. Derived State (useMemo)
  const viewItems = useMemo(() => items.map(toSyncingAnimePanelViewModel), [items]);
  const isEmpty = useMemo(() => !isLoading && viewItems.length === 0, [isLoading, viewItems.length]);

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects

  return {
    items: viewItems,
    isLoading,
    isEmpty,
  };
}
