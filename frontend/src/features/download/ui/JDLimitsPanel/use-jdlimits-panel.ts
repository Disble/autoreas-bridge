import { useCallback, useEffect, useState } from 'react';
import { downloadRuntimeSource } from '../../../../infrastructure/download-runtime-source/download-runtime-source.helpers';
import type { DownloadRuntimeSource } from '../../../../infrastructure/download-runtime-source/download-runtime-source.types';

/**
 * useJDLimitsPanel reads JDownloader's "Max. simultaneous Downloads" setting for display.
 *
 * The reading is read-only by necessity, not by preference: changing the setting requires
 * the MyJDownloader `/config/set` endpoint, which the client does not implement yet.
 *
 * The backend reports 0 when it could not read the setting at all. That is an absent
 * reading, not a configured limit, so it is exposed as `isAvailable: false` rather than as
 * the number 0 — which would tell the user JDownloader downloads nothing.
 */
export function useJDLimitsPanel(source: DownloadRuntimeSource = downloadRuntimeSource) {
  // 1. Refs

  // 2. State
  const [maxSimultaneousDownloads, setMaxSimultaneousDownloads] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const isAvailable = maxSimultaneousDownloads > 0;

  let status: 'loading' | 'error' | 'ready' = 'ready';

  if (!hasLoaded) {
    status = 'loading';
  } else if (errorMessage !== undefined) {
    status = 'error';
  }

  // 6. Callbacks (useCallback calling pure helpers)
  const refresh = useCallback(async () => {
    setIsRefreshing(true);

    try {
      const limit = await source.getJDMaxSimultaneousDownloads();
      setMaxSimultaneousDownloads(limit);
      setErrorMessage(undefined);

    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to read the JDownloader download limit');
    } finally {
      setHasLoaded(true);
      setIsRefreshing(false);
    }
  }, [source]);

  // 7. Effects
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    status,
    maxSimultaneousDownloads,
    isAvailable,
    isRefreshing,
    errorMessage,
    refresh,
  };
}
