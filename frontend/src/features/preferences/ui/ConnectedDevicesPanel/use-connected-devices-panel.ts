import { useCallback, useEffect, useMemo, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import { toConnectedDeviceRows } from './connected-devices-panel.helpers';
import type { ConnectedDevice, ConnectedDevicesPanelProps } from './connected-devices-panel.types';

/**
 * Loads connected devices and exposes the unpair command for the Configs subsection.
 */
export function useConnectedDevicesPanel(props: Readonly<ConnectedDevicesPanelProps>) {
  // 1. Refs

  // 2. State
  const [devices, setDevices] = useState<readonly ConnectedDevice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const source = useMemo(
    () =>
      props.source ?? {
        getConnectedDevices: bridgeRuntimeSource.getConnectedDevices ?? (() => Promise.resolve([])),
        unpairDevice: bridgeRuntimeSource.unpairDevice ?? (() => Promise.resolve('runtime unavailable')),
    },
    [props.source],
  );
  const rows = useMemo(() => toConnectedDeviceRows(devices), [devices]);

  // 6. Callbacks (useCallback calling pure helpers)
  const refresh = useCallback(() => {
    setIsLoading(true);
    setErrorMessage('');
    void source
      .getConnectedDevices()
      .then((nextDevices) => {
        setDevices(nextDevices);
      })
      .catch(() => {
        setErrorMessage('Could not load connected devices.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [source]);

  const unpairDevice = useCallback(
    (deviceID: string) => {
      setErrorMessage('');
      void source
        .unpairDevice(deviceID)
        .then((status) => {
          if (status !== 'ok') {
            setErrorMessage(status);
            return;
          }
          refresh();
        })
        .catch(() => {
          setErrorMessage('Could not unpair device.');
        });
    },
    [refresh, source],
  );

  // 7. Effects
  useEffect(() => {
    // eslint-disable-next-line react-doctor/no-derived-state -- A pending request has no derivable source; loading must persist until it settles.
    refresh();
  }, [refresh]);

  return {
    errorMessage,
    isLoading,
    rows,
    unpairDevice,
  };
}
