import { useEffect, useState } from 'react';
import { downloadRuntimeSource } from '../../../../../infrastructure/download-runtime-source/download-runtime-source.helpers';
import type { DownloadRuntimeSource } from '../../../../../infrastructure/download-runtime-source/download-runtime-source.types';
import { useDownloadRuntimeStore } from '../../../../../shared/store/download-runtime-store/download-runtime-store';
import { connectDownloadRuntimeStore } from '../../../../../shared/store/download-runtime-store/download-runtime-store.helpers';
import { AUTO_DOWNLOAD_CLOCK_TICK_MS } from './auto-download-chip.constants';
import { getAutoDownloadChip } from './auto-download-chip.helpers';
import type { AutoDownloadChipView } from './auto-download-chip.types';

/**
 * useAutoDownloadChip reads the Downloads schedule from the shared read-model,
 * which run events keep current, and re-reads the clock every minute so the
 * chip moves on at the scheduled time and at midnight. It never writes the
 * schedule: Downloads owns it.
 *
 * @param source The Downloads port the shared read-model loads through.
 * @returns The chip to render, or null until the schedule has loaded or when it could not be read.
 */
export function useAutoDownloadChip(source: DownloadRuntimeSource = downloadRuntimeSource): AutoDownloadChipView | null {
  // 2. State
  const [now, setNow] = useState(() => new Date());

  // 3. Context/3rd Party Hooks
  const scheduleConfig = useDownloadRuntimeStore((state) => state.scheduleConfig);
  const scheduleHasLoaded = useDownloadRuntimeStore((state) => state.scheduleHasLoaded);
  const scheduleErrorMessage = useDownloadRuntimeStore((state) => state.scheduleErrorMessage);

  // 5. Derived State
  // A failed read leaves the empty, disabled config in the store: showing it would claim "Off".
  const view = scheduleHasLoaded && scheduleErrorMessage === undefined ? getAutoDownloadChip(scheduleConfig, now) : null;

  // 7. Effects
  // Stryker disable ArrayDeclaration: both deps arrays are mutation-equivalent. `[source]` versus `[]`
  // differs only when the port changes between renders, which no caller does, and connecting is
  // idempotent anyway; `[]` versus a fixed literal such as `["Stryker was here"]` never re-runs either,
  // since React compares each element with `Object.is`.
  useEffect(() => {
    connectDownloadRuntimeStore(source);
  }, [source]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), AUTO_DOWNLOAD_CLOCK_TICK_MS);
    return () => clearInterval(interval);
  }, []);
  // Stryker restore ArrayDeclaration

  return view;
}
