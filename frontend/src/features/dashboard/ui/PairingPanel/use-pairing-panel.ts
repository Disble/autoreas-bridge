import { useCallback, useEffect, useMemo, useState } from 'react';
import { getEffectiveAddress, getPairingToken, subscribeToEvent } from '../../dashboard.bindings';
import { PAIRING_TOKEN_CONSUMED_EVENT_NAME } from './pairing-panel.constants';
import { buildPairingQrImageUrl, buildPairingQrValue, parseEffectiveAddress } from './pairing-panel.helpers';

export function usePairingPanel() {
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
  const hasQrValue = useMemo(() => qrValue.length > 0, [qrValue]);

  // 6. Callbacks (useCallback calling pure helpers)
  const refreshPairingToken = useCallback(async () => {
    setToken('');
    setQrImageUrl('');
    const nextToken = await getPairingToken();
    setToken(nextToken);
  }, []);

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
    void getEffectiveAddress().then(setAddress);
    void getPairingToken().then(setToken);
  }, []);

  useEffect(() => {
    const stop = subscribeToEvent(PAIRING_TOKEN_CONSUMED_EVENT_NAME, () => {
      void refreshPairingToken();
    });

    return () => {
      stop?.();
    };
  }, [refreshPairingToken]);

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
