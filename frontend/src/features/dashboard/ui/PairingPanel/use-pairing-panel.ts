import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DevicesSource } from '../../../../shared/contracts/devices.types';
import { toAsyncView } from '../../../../shared/query/async-view/async-view.helpers';
import { BRIDGE_DEVICES_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { DEVICES_PAIRING_TOKEN_KEY, devicesKeys } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
import { buildPairingQrImageUrl, buildPairingQrValue, parseEffectiveAddress, toPairingPanelReadings } from './pairing-panel.helpers';

/**
 * Reads the pairing address (module `api`) and token (module `devices`) through
 * `useBridgeQuery`, builds the QR image, and handles copy. A consumed token is
 * re-read by the `pairing.token-consumed` rule in `BRIDGE_INVALIDATIONS`.
 * @param source The Devices port the address and token are read through.
 * @returns The token, the parsed address, the QR image, the failure and the copy handler.
 */
export function usePairingPanel(source: Pick<DevicesSource, 'getEffectiveAddress' | 'getPairingToken'> = BRIDGE_DEVICES_SOURCE) {
  // 1. Refs

  // 2. State
  const [copied, setCopied] = useState(false);
  const [qrImageUrl, setQrImageUrl] = useState('');

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const addressQuery = useBridgeQuery({
    queryKey: devicesKeys.key('effective-address'),
    queryFn: () => source.getEffectiveAddress(),
    module: 'api',
  });
  const tokenQuery = useBridgeQuery({
    queryKey: DEVICES_PAIRING_TOKEN_KEY,
    queryFn: () => source.getPairingToken(),
    module: 'devices',
  });

  // 5. Derived State (useMemo)
  const { address, failureMessage, token } = toPairingPanelReadings({ address: toAsyncView(addressQuery), token: toAsyncView(tokenQuery) });
  const parsedAddress = useMemo(() => parseEffectiveAddress(address), [address]);
  const qrValue = useMemo(
    () =>
      buildPairingQrValue({
        ip: parsedAddress.ip,
        port: parsedAddress.port,
        token,
      }),
    [parsedAddress.ip, parsedAddress.port, token],
  );
  const hasQrValue = qrValue.length > 0;

  // 6. Callbacks (useCallback calling pure helpers)
  const onCopyToken = useCallback(async () => {
    if (!token) {
      return;
    }

    await navigator.clipboard.writeText(token);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [token]);

  // 7. Effects
  useEffect(() => {
    if (!hasQrValue) {
      return;
    }

    let active = true;

    void buildPairingQrImageUrl(qrValue).then((nextQrImageUrl) => {
      if (!active) {
        return;
      }

      setQrImageUrl(nextQrImageUrl);
    });

    return () => {
      active = false;
    };
  }, [hasQrValue, qrValue]);

  return {
    token,
    copied,
    failureMessage,
    ip: parsedAddress.ip,
    port: parsedAddress.port,
    qrImageUrl: hasQrValue ? qrImageUrl : '',
    onCopyToken,
  };
}
