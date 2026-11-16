import { useEffect, useState } from 'react';
import type { DownloadsSource } from '../../../../../shared/contracts/download.types';
import { useDownloadSchedule } from '../../../../../shared/hooks/use-missed-schedule-notice/use-download-schedule';
import { BRIDGE_DOWNLOADS_SOURCE } from '../../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { AUTO_DOWNLOAD_CLOCK_TICK_MS } from './auto-download-chip.constants';
import { getAutoDownloadChip } from './auto-download-chip.helpers';
import type { AutoDownloadChipView } from './auto-download-chip.types';

/**
 * useAutoDownloadChip reads the Downloads schedule from the shared schedule
 * query, which run events keep current, and re-reads the clock every minute so
 * the chip moves on at the scheduled time and at midnight. It never writes the
 * schedule: Downloads owns it.
 *
 * @param source The downloads port the shared schedule query reads through.
 * @returns The chip to render, or null until the schedule has loaded or when it could not be read.
 */
export function useAutoDownloadChip(source: DownloadsSource = BRIDGE_DOWNLOADS_SOURCE): AutoDownloadChipView | null {
  // 2. State
  const [now, setNow] = useState(() => new Date());

  // 4. Queries/Mutations
  const scheduleQuery = useDownloadSchedule(source);

  // 5. Derived State
  // Only a loaded schedule says anything: a starting module or a failed read would otherwise read as "Off".
  const view = scheduleQuery.status === 'success' ? getAutoDownloadChip(scheduleQuery.data, now) : null;

  // 7. Effects
  // Stryker disable ArrayDeclaration: `[]` versus a fixed literal such as `["Stryker was here"]` never
  // re-runs either, since React compares each element with `Object.is`.
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), AUTO_DOWNLOAD_CLOCK_TICK_MS);
    return () => clearInterval(interval);
  }, []);
  // Stryker restore ArrayDeclaration

  return view;
}
