import { useCallback, useEffect, useMemo, useState } from 'react';
import { getEffectiveAddress, getPairingToken } from '../../dashboard.bindings';
import { buildPairingQrValue, parseEffectiveAddress } from './pairing-panel.helpers';

export function usePairingPanel() {
  // 1. Refs

  // 2. State
  const [address, setAddress] = useState('');
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState(false);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const parsedAddress = useMemo(() => parseEffectiveAddress(address), [address]);
  const qrValue = useMemo(() => buildPairingQrValue(parsedAddress), [parsedAddress]);

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
    void getEffectiveAddress().then(setAddress);
    void getPairingToken().then(setToken);
  }, []);

  return {
    token,
    copied,
    ip: parsedAddress.ip,
    port: parsedAddress.port,
    qrValue,
    onCopyToken,
  };
}
