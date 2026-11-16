import { useCallback } from 'react';
import { BRIDGE_DEVICES_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { DEVICES_CONNECTED_KEY } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
import { toConnectedDevicesView, toVisibleUnpairFailure } from './connected-devices-panel.helpers';
import type { ConnectedDevicesPanelProps } from './connected-devices-panel.types';

/**
 * Reads the paired devices through `useBridgeQuery` (module `devices`) and
 * revokes one through `useBridgeMutation`, re-reading the list once it is
 * revoked. A pairing or a device acknowledgment re-reads the list in place
 * through the `BRIDGE_INVALIDATIONS` rules.
 * @param props The panel props; `source` replaces the Devices port in tests.
 * @returns The panel view and the unpair action.
 */
export function useConnectedDevicesPanel(props: Readonly<ConnectedDevicesPanelProps>) {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks
  const source = props.source ?? BRIDGE_DEVICES_SOURCE;

  // 4. Queries/Mutations
  const query = useBridgeQuery({
    queryKey: DEVICES_CONNECTED_KEY,
    queryFn: () => source.getConnectedDevices(),
    module: 'devices',
  });
  const { refetch } = query;
  const unpair = useBridgeMutation({
    mutationFn: (deviceId: string) => source.unpairDevice(deviceId),
    onSuccess: () => {
      void refetch();
    },
  });

  // 5. Derived State
  const view = toConnectedDevicesView(query, toVisibleUnpairFailure(unpair, query.dataUpdatedAt));

  // 6. Callbacks (useCallback calling pure helpers)
  const { mutate } = unpair;
  const unpairDevice = useCallback((deviceId: string) => mutate(deviceId), [mutate]);

  // 7. Effects

  return { view, unpairDevice };
}
