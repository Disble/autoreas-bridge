import type { DevicesSource } from '../../../../shared/contracts/devices.types';
import { BRIDGE_DEVICES_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { devicesKeys } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
import { toSyncingAnimePanelView } from './syncing-anime-panel.helpers';
import type { SyncingAnimePanelProps } from './syncing-anime-panel.types';

/**
 * Drives the syncing-anime panel: reads the pending queue through `useBridgeQuery`,
 * gated on the `sync` module and keyed by the refresh token the Devices page bumps
 * after a reconcile, and derives the one view (loading, failure, empty or ready)
 * the panel renders.
 * @param props The panel props; `refreshToken` re-reads the queue when it changes.
 * @param source The Devices port the queue is read through.
 * @returns The panel view.
 */
export function useSyncingAnimePanel(
  props: Readonly<SyncingAnimePanelProps>,
  source: Pick<DevicesSource, 'getSyncingAnimeItems'> = BRIDGE_DEVICES_SOURCE,
) {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const query = useBridgeQuery({
    queryKey: devicesKeys.key('syncing-anime', props.refreshToken),
    queryFn: () => source.getSyncingAnimeItems(),
    module: 'sync',
  });

  // 5. Derived State
  const view = toSyncingAnimePanelView(query);

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects

  return { view };
}
