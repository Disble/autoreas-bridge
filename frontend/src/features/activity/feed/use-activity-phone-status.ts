import { useCallback, useEffect, useState } from 'react';
import { bridgeRuntimeSource } from '../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import { ACTIVITY_PHONE_STATUS_TICK_MS } from './activity-feed.constants';
import type { ActivityPhoneDevice } from './activity-feed.types';
import { toPhoneStatus } from './activity-phone-status.helpers';

/** Reads the paired devices through the same binding the Devices page uses; none without a Wails runtime. */
const readBridgeDevices = (): Promise<readonly ActivityPhoneDevice[]> => bridgeRuntimeSource.getConnectedDevices?.() ?? Promise.resolve([]);

/**
 * The phone status line under the Activity title (S13). It reads the paired
 * devices on mount, every 15 s and whenever the window regains focus, and the
 * same tick keeps its relative time fresh. A failed read keeps the last line.
 *
 * @param readDevices Reads the paired devices; the bridge binding by default.
 * @returns The line, or undefined to hide it.
 */
export function useActivityPhoneStatus(readDevices: () => Promise<readonly ActivityPhoneDevice[]> = readBridgeDevices) {
  // 1. Refs

  // 2. State
  const [devices, setDevices] = useState<readonly ActivityPhoneDevice[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const phoneStatus = toPhoneStatus(devices, nowMs);

  // 6. Callbacks (useCallback calling pure helpers)
  const refresh = useCallback(() => {
    void readDevices()
      .then((next) => {
        setDevices(next);
        setNowMs(Date.now());
      })
      .catch(() => undefined);
  }, [readDevices]);

  // 7. Effects
  useEffect(() => {
    refresh();
    const tick = window.setInterval(refresh, ACTIVITY_PHONE_STATUS_TICK_MS);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  return phoneStatus;
}
