import { useCallback, useEffect, useMemo, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import { buildPairingQrImageUrl, buildPairingQrValue, parseEffectiveAddress } from './pairing-panel.helpers';

/** Loads pairing address and token, builds the QR image, and handles copy + refresh. */
export function usePairingPanel(source: BridgeRuntimeSource = bridgeRuntimeSource) {
  // 1. Refs

  // 2. State
  const [address, setAddress] = useState('');
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [qrImageUrl, setQrImageUrl] = useState('');

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
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
  const refreshPairingToken = useCallback(async () => {
    setToken('');
    setQrImageUrl('');
    const nextToken = await source.getPairingToken();
    setToken(nextToken);
  }, [source]);

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
    void source.getEffectiveAddress().then(setAddress);
    void source.getPairingToken().then(setToken);
  }, [source]);

  useEffect(() => {
    const unsubscribe = source.onPairingTokenConsumed(() => {
      void refreshPairingToken();
    });

    return () => {
      unsubscribe();
    };
  }, [refreshPairingToken, source]);

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
    ip: parsedAddress.ip,
    port: parsedAddress.port,
    qrImageUrl: hasQrValue ? qrImageUrl : '',
    onCopyToken,
  };
}
